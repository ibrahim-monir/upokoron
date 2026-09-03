<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Jobs\ImportProductImage;
use App\Models\Category;
use App\Models\Media;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Services\Media\MediaService;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Importing products from outside the shop.
 *
 * Two things are being protected here. The obvious one is the catalogue: an
 * import that creates a product at the wrong price, or silently publishes
 * one, is worse than no import at all -- so drafts, and a row that cannot be
 * read is reported rather than guessed.
 *
 * The less obvious one is the server. `scrape` is the only endpoint in this
 * application that makes the shop's own machine fetch an address a user
 * typed, which is a textbook SSRF hole if it is allowed to point inwards.
 * That test is the important one in this file.
 */
class ProductImportTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);
        $this->category = Category::factory()->create(['name' => 'Diodes']);
    }

    /** The host guard needs real DNS, which a fake shop domain does not have. */
    private function allowFakeHosts(): void
    {
        config(['upokoron.import.block_private_hosts' => false]);
    }

    private function page(string $body): void
    {
        Http::fake(['*' => Http::response($body, 200, ['Content-Type' => 'text/html; charset=UTF-8'])]);
    }

    /*
    |--------------------------------------------------------------------------
    | Reading a product page
    |--------------------------------------------------------------------------
    */

    public function test_it_reads_a_product_from_schema_org_json_ld(): void
    {
        $this->allowFakeHosts();
        $this->actingAsRole('manager');

        $this->page(<<<'HTML'
            <html><head>
            <script type="application/ld+json">
            {"@context":"https://schema.org","@graph":[
              {"@type":"WebSite","name":"A shop"},
              {"@type":"Product","name":"1N4007 1A 1000V Rectifier Diode","sku":"DIO-1N4007",
               "brand":{"@type":"Brand","name":"Generic"},
               "description":"Standard rectifier diode in a DO-41 package.",
               "image":["https://shop.test/img/1n4007.jpg","https://shop.test/img/1n4007-2.jpg"],
               "additionalProperty":[{"@type":"PropertyValue","name":"Package","value":"DO-41"}],
               "offers":{"@type":"Offer","price":"2.50","priceCurrency":"BDT",
                         "availability":"https://schema.org/InStock"}}
            ]}
            </script>
            </head><body><h1>Ignore me</h1></body></html>
            HTML);

        $response = $this->postJson('/api/v1/admin/products/import/scrape', [
            'url' => 'https://shop.test/product/1n4007',
        ]);

        $response->assertOk()
            ->assertJsonPath('product.name', '1N4007 1A 1000V Rectifier Diode')
            ->assertJsonPath('product.sku', 'DIO-1N4007')
            ->assertJsonPath('product.brand', 'Generic')
            ->assertJsonPath('product.selling_price', '2.50')
            ->assertJsonPath('product.currency', 'BDT')
            ->assertJsonPath('product.availability', 'InStock')
            ->assertJsonPath('product.additional_info.0.feature', 'Package')
            ->assertJsonCount(2, 'product.images');

        // A read is a read: nothing is written until a person saves the form.
        $this->assertSame(0, Product::count());
    }

    public function test_it_falls_back_to_opengraph_when_there_is_no_json_ld(): void
    {
        $this->allowFakeHosts();
        $this->actingAsRole('manager');

        $this->page(<<<'HTML'
            <html><head>
            <meta property="og:title" content="SR5200 5A 200V Schottky Barrier Rectifier Diode">
            <meta property="og:description" content="Low forward voltage drop.">
            <meta property="og:image" content="/img/sr5200.jpg">
            <meta property="product:price:amount" content="৳25.00">
            <meta property="product:price:currency" content="BDT">
            </head><body><h1>SR5200</h1></body></html>
            HTML);

        $this->postJson('/api/v1/admin/products/import/scrape', ['url' => 'https://shop.test/p/sr5200'])
            ->assertOk()
            ->assertJsonPath('product.name', 'SR5200 5A 200V Schottky Barrier Rectifier Diode')
            ->assertJsonPath('product.selling_price', '25.00')
            // A relative image URL is resolved against the page it came from.
            ->assertJsonPath('product.images.0', 'https://shop.test/img/sr5200.jpg');
    }

    /**
     * Both halves of this are what a real shop actually served.
     *
     * techshopbd.com publishes a complete JSON-LD Product -- and writes its
     * description into it with the line breaks left in, which is invalid
     * JSON. A strict decode returns null, and the whole block, price and all,
     * is thrown away silently. The title is the other half: written for a
     * search result, so it carries the shop's name after the product's.
     */
    public function test_it_survives_the_raw_line_breaks_shops_leave_in_their_json_ld(): void
    {
        $this->allowFakeHosts();
        $this->actingAsRole('manager');

        $this->page(
            '<html><head>'
            .'<meta property="og:site_name" content="TechShopBD">'
            .'<title>Arduino Uno R3 Price in BD | TechShopBD</title>'
            .'<script type="application/ld+json">'
            .'{"@context":"https://schema.org","@graph":[{"@type":["WebPage","ItemPage"],"name":"page"},'
            .'{"@type":"Product","name":"Arduino Uno R3","sku":"131106001253",'
            ."\"description\":\"The Arduino Uno R3,\nbuilt around the ATmega328P.\","
            .'"offers":{"@type":"Offer","price":"920.04","priceCurrency":"BDT",'
            .'"availability":"https://schema.org/InStock"}}]}'
            .'</script></head><body></body></html>'
        );

        $this->postJson('/api/v1/admin/products/import/scrape', ['url' => 'https://shop.test/p/uno'])
            ->assertOk()
            ->assertJsonPath('product.name', 'Arduino Uno R3')
            ->assertJsonPath('product.sku', '131106001253')
            ->assertJsonPath('product.selling_price', '920.04');
    }

    public function test_the_shop_name_is_cut_off_a_page_title(): void
    {
        $this->allowFakeHosts();
        $this->actingAsRole('manager');

        $this->page(
            '<html><head>'
            .'<meta property="og:site_name" content="TechShopBD">'
            .'<meta property="og:title" content="Arduino Uno R3 Price in BD | TechShopBD">'
            .'<meta property="og:description" content="A development board.">'
            .'<meta property="og:image" content="https://shop.test/uno.jpg">'
            .'</head><body></body></html>'
        );

        $this->postJson('/api/v1/admin/products/import/scrape', ['url' => 'https://shop.test/p/uno'])
            ->assertOk()
            ->assertJsonPath('product.name', 'Arduino Uno R3 Price in BD');
    }

    /** A dash inside the product's own name is not a shop name and must survive. */
    public function test_a_title_that_is_only_a_product_name_is_left_alone(): void
    {
        $this->allowFakeHosts();
        $this->actingAsRole('manager');

        $this->page(
            '<html><head>'
            .'<meta property="og:site_name" content="TechShopBD">'
            .'<meta property="og:title" content="Wall Mounted 2-in-1 Charging Stand">'
            .'<meta property="og:description" content="A bracket.">'
            .'<meta property="og:image" content="https://shop.test/bracket.jpg">'
            .'</head><body></body></html>'
        );

        $this->postJson('/api/v1/admin/products/import/scrape', ['url' => 'https://shop.test/p/bracket'])
            ->assertOk()
            ->assertJsonPath('product.name', 'Wall Mounted 2-in-1 Charging Stand');
    }

    public function test_it_refuses_an_address_inside_the_server_network(): void
    {
        $this->actingAsRole('manager');

        Http::fake(['*' => Http::response('<html></html>')]);

        foreach ([
            'http://127.0.0.1/product/1',
            'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
            'http://192.168.0.1/admin',
            'http://[::1]/product',
        ] as $url) {
            $this->postJson('/api/v1/admin/products/import/scrape', ['url' => $url])
                ->assertStatus(422)
                ->assertJsonPath('code', 'import_url_refused');
        }

        // Not "it was refused after fetching" -- it must never leave.
        Http::assertNothingSent();
    }

    public function test_it_refuses_a_page_with_no_product_on_it(): void
    {
        $this->allowFakeHosts();
        $this->actingAsRole('manager');

        $this->page('<html><head><title>Category: Diodes</title></head><body>Listing</body></html>');

        $this->postJson('/api/v1/admin/products/import/scrape', ['url' => 'https://shop.test/category/diodes'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'import_no_product');
    }

    public function test_reading_a_page_needs_permission_to_create_products(): void
    {
        $this->allowFakeHosts();
        $this->actingAsRole('support'); // products.view, but not products.create

        Http::fake();

        $this->postJson('/api/v1/admin/products/import/scrape', ['url' => 'https://shop.test/p/1'])
            ->assertForbidden();

        Http::assertNothingSent();
    }

    /*
    |--------------------------------------------------------------------------
    | Reading a supplier's price list
    |--------------------------------------------------------------------------
    */

    private function csv(string $contents, string $name = 'price-list.csv'): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, $contents);
    }

    public function test_a_dry_run_reports_what_would_happen_and_writes_nothing(): void
    {
        $this->actingAsRole('manager');

        $response = $this->post('/api/v1/admin/products/import/csv', [
            'file' => $this->csv(<<<'CSV'
                Name,SKU,Category,Price
                1N4007 Rectifier Diode,DIO-1N4007,Diodes,2.50
                1N5408 Rectifier Diode,DIO-1N5408,Diodes,4.00
                CSV),
            'dry_run' => true,
        ]);

        $response->assertOk()
            ->assertJsonPath('summary.rows', 2)
            ->assertJsonPath('summary.created', 2)
            ->assertJsonPath('summary.failed', 0);

        $this->assertSame(0, Product::count());
    }

    public function test_it_creates_products_as_drafts_and_queues_their_pictures(): void
    {
        Queue::fake();

        $this->actingAsRole('manager');

        $this->post('/api/v1/admin/products/import/csv', [
            'file' => $this->csv(<<<'CSV'
                Product Name;Item Code;Category;Brand;Rate;Regular Price;Image
                1N4007 Rectifier Diode;DIO-1N4007;Diodes;Generic;2.50;3.00;https://shop.test/a.jpg|https://shop.test/b.jpg
                CSV),
            'create_missing' => true,
        ])->assertOk()->assertJsonPath('summary.created', 1);

        $product = Product::firstOrFail();

        $this->assertSame('1N4007 Rectifier Diode', $product->name);
        $this->assertSame('draft', $product->status->value);
        $this->assertSame($this->category->id, $product->category_id);
        $this->assertSame('Generic', $product->brand?->name);

        $variation = $product->variations()->firstOrFail();

        $this->assertSame('DIO-1N4007', $variation->sku);
        $this->assertSame('2.50', (string) $variation->selling_price);
        $this->assertSame('3.00', (string) $variation->compare_at_price);

        Queue::assertPushed(ImportProductImage::class, 2);
    }

    public function test_it_updates_an_existing_product_by_sku_without_blanking_the_rest(): void
    {
        $this->actingAsRole('manager');

        $this->postJson('/api/v1/admin/products', [
            'name' => '1N4007 Rectifier Diode',
            'category_id' => $this->category->id,
            'type' => 'simple',
            'status' => 'active',
            'sku' => 'DIO-1N4007',
            'selling_price' => '2.50',
            'description' => 'The description the shop wrote itself.',
        ])->assertCreated();

        $this->post('/api/v1/admin/products/import/csv', [
            'file' => $this->csv(<<<'CSV'
                SKU,Price
                DIO-1N4007,2.75
                CSV),
        ])->assertOk()
            ->assertJsonPath('summary.updated', 1)
            ->assertJsonPath('summary.created', 0);

        $product = Product::firstOrFail();

        $this->assertSame('2.75', (string) $product->variations()->firstOrFail()->selling_price);

        // The point of the whole update path: a two-column price list must
        // not wipe the columns it did not carry.
        $this->assertSame('The description the shop wrote itself.', $product->description);
        $this->assertSame('active', $product->status->value);
    }

    public function test_a_row_that_cannot_be_read_fails_on_its_own(): void
    {
        $this->actingAsRole('manager');

        $response = $this->post('/api/v1/admin/products/import/csv', [
            'file' => $this->csv(<<<'CSV'
                Name,SKU,Category,Price,Regular price
                Good Diode,DIO-OK,Diodes,4.00,
                No Price Diode,DIO-NOPRICE,Diodes,,
                Backwards Diode,DIO-BACK,Diodes,10.00,5.00
                CSV),
        ]);

        $response->assertOk()
            ->assertJsonPath('summary.created', 1)
            ->assertJsonPath('summary.failed', 2);

        $this->assertSame(1, Product::count());
        $this->assertSame('DIO-OK', ProductVariation::firstOrFail()->sku);
    }

    public function test_an_unknown_category_stops_the_row_unless_asked_to_create_it(): void
    {
        $this->actingAsRole('manager');

        $file = <<<'CSV'
            Name,SKU,Category,Price
            Ceramic Capacitor 100nF,CAP-100N,Capacitors,1.50
            CSV;

        $this->post('/api/v1/admin/products/import/csv', ['file' => $this->csv($file)])
            ->assertOk()
            ->assertJsonPath('summary.failed', 1);

        $this->post('/api/v1/admin/products/import/csv', ['file' => $this->csv($file), 'create_missing' => true])
            ->assertOk()
            ->assertJsonPath('summary.created', 1);

        $this->assertDatabaseHas('categories', ['name' => 'Capacitors']);
    }

    /*
    |--------------------------------------------------------------------------
    | The pictures
    |--------------------------------------------------------------------------
    */

    public function test_an_imported_picture_is_copied_into_the_library_not_hotlinked(): void
    {
        Storage::fake(MediaService::DISK);

        config(['upokoron.import.block_private_hosts' => false]);

        $this->actingAsRole('manager');

        $product = Product::factory()->create(['category_id' => $this->category->id]);

        // The bytes of a real JPEG, served as if by the other shop.
        $bytes = UploadedFile::fake()->image('theirs.jpg', 800, 800)->getContent();

        Http::fake(['*' => Http::response($bytes, 200, ['Content-Type' => 'image/jpeg'])]);

        $this->postJson("/api/v1/admin/products/{$product->id}/images", [
            'source_url' => 'https://shop.test/img/theirs.jpg',
        ])->assertCreated();

        $media = Media::sole();

        $this->assertSame('products', $media->folder);
        Storage::disk(MediaService::DISK)->assertExists($media->path);

        // The product points at our copy, not at their server.
        $image = $product->images()->sole();

        $this->assertSame($media->path, $image->path);
        $this->assertStringNotContainsString('shop.test', $image->path);
    }

    public function test_a_picture_on_a_private_address_is_not_downloaded(): void
    {
        Storage::fake(MediaService::DISK);

        $this->actingAsRole('manager');

        $product = Product::factory()->create(['category_id' => $this->category->id]);

        Http::fake();

        $this->postJson("/api/v1/admin/products/{$product->id}/images", [
            'source_url' => 'http://127.0.0.1:8080/secret.jpg',
        ])->assertStatus(422)->assertJsonPath('code', 'import_url_refused');

        Http::assertNothingSent();
        $this->assertSame(0, Media::count());
    }

    public function test_the_template_lists_the_headings_the_reader_understands(): void
    {
        $this->actingAsRole('manager');

        $response = $this->get('/api/v1/admin/products/import/template');

        $response->assertOk();
        $this->assertStringContainsString('Name,SKU,Category', $response->streamedContent());
    }
}
