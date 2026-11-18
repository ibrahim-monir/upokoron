<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Jobs\ImportProductImage;
use App\Jobs\SyncDropshippingPage;
use App\Models\DropShippingCatalogItem;
use App\Models\DropShippingImportRun;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Services\Catalog\Dropshipping\DropshippingSettings;
use App\Services\Catalog\Dropshipping\DropshippingSyncRunner;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * DropShipping.com.bd panel sync: login, import, no duplicates, price and
 * stock updates, and sold-out products archived then restored.
 */
class DropshippingSyncTest extends TestCase
{
    use RefreshDatabase;

    private const BASE = 'https://www.dropshipping.com.bd';

    /** @var array<int, array<string, mixed>> */
    private array $panel = [];

    private bool $rejectLogin = false;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);

        app(DropshippingSettings::class)->save([
            'phone' => '01700000000',
            'password' => 'secret',
            'sources' => 'category_id=15',
            'request_delay_ms' => 0,
        ]);

        $this->panel = [
            $this->row(27084, '13292', 'Mini Bluetooth Speaker', 990, 630, 2),
            $this->row(27085, '13293', 'USB Desk Fan', 450, 300, 5),
        ];

        $this->fakePanel();
    }

    private function row(int $id, string $code, string $name, int $resell, int $cost, int $stock, int $status = 1): array
    {
        return [
            'id' => $id, 'product_code' => $code, 'name' => $name,
            'category_id' => 15, 'sub_category_id' => 65, 'sub_sub_category_id' => null,
            'price' => $resell + 400, 'sale_price' => $cost, 'reselling_price' => $resell,
            'stock' => $stock, 'status' => $status, 'details' => '<p>Nice <script>x()</script>thing</p>',
            'thumbnail_img' => 'images/product_thumbnail_img/thumb_'.$code.'.jpg',
        ];
    }

    private function fakePanel(): void
    {
        Http::fake(function ($request) {
            $url = $request->url();

            if (str_ends_with($url, '/login') && $request->method() === 'GET') {
                return Http::response('<form><input type="hidden" name="_token" value="tok123"></form>', 200, ['Content-Type' => 'text/html']);
            }
            if (str_ends_with($url, '/login')) {
                return Http::response('', 302, ['Location' => self::BASE.'/dropshipper/dashboard', 'Set-Cookie' => 'panel_session=abc; path=/']);
            }
            if ($this->rejectLogin && str_contains($url, '/api/')) {
                return Http::response('', 302, ['Location' => self::BASE.'/login']);
            }
            if (str_contains($url, '/api/reseller/show/product/list')) {
                return Http::response([
                    'products' => ['current_page' => 1, 'last_page' => 1, 'total' => count($this->panel), 'data' => $this->panel],
                    'categories' => [['id' => 15, 'name' => 'Gadgets & Electronics']],
                    'sub_categories' => [['id' => 65, 'name' => 'Speaker']],
                    'sub_sub_categories' => [],
                ]);
            }
            if (preg_match('#/api/search/product/(\d+)#', $url, $m)) {
                $row = collect($this->panel)->firstWhere('product_code', $m[1]);
                if ($row && $m[1] === '13292') {
                    $row['product_variant'] = [
                        ['attribute_id' => 2, 'variant' => ['name' => 'White']],
                        ['attribute_id' => 2, 'variant' => ['name' => 'Blue']],
                    ];
                    $row['product_image'] = [['image' => 'images/products/a.jpg'], ['image' => 'images/products/b.jpg']];
                }

                return Http::response(['status' => 'OK', 'products' => ['data' => $row ? [$row] : []]]);
            }

            return Http::response('not found', 404);
        });
    }

    private function runSync(): DropShippingImportRun
    {
        $runner = app(DropshippingSyncRunner::class);
        $run = $runner->start('manual');
        $runner->step($run->id, 0, 1, 0);

        return $run->refresh();
    }

    public function test_it_imports_drafts_with_variations_images_and_sku(): void
    {
        Queue::fake([ImportProductImage::class, SyncDropshippingPage::class]);

        $run = $this->runSync();

        $this->assertSame('completed', $run->status);
        $this->assertSame(2, $run->created_count);

        $speaker = DropShippingCatalogItem::where('product_code', '13292')->first()->product;
        $this->assertSame('draft', $speaker->status->value);
        $this->assertSame('variable', $speaker->type->value);
        $this->assertFalse($speaker->is_stock_tracked);
        $this->assertStringNotContainsString('script', (string) $speaker->description);

        $variations = ProductVariation::where('product_id', $speaker->id)->orderBy('position')->get();
        $this->assertCount(2, $variations);
        $this->assertSame('990.00', (string) $variations[0]->selling_price);
        $this->assertSame('1390.00', (string) $variations[0]->compare_at_price);
        $this->assertMatchesRegularExpression('/^01-\d{2,}-13292-(WHITE|BLUE)$/', $variations[0]->sku);
        $this->assertSame('Speaker', $speaker->category->name);

        Queue::assertPushed(ImportProductImage::class, fn ($job) => $job->url === self::BASE.'/public/storage/images/products/a.jpg');
        Queue::assertPushed(ImportProductImage::class, 3); // 2 gallery + 1 thumbnail fallback

        $fan = DropShippingCatalogItem::where('product_code', '13293')->first();
        $this->assertSame('300.00', (string) $fan->cost_price);
        $this->assertMatchesRegularExpression('/^01-\d{2,}-13293$/', ProductVariation::where('product_id', $fan->product_id)->value('sku'));
    }

    public function test_a_second_run_updates_price_and_never_duplicates(): void
    {
        Queue::fake([ImportProductImage::class, SyncDropshippingPage::class]);
        $this->runSync();

        $this->panel[1]['reselling_price'] = 500;
        $run = $this->runSync();

        $this->assertSame(0, $run->created_count);
        $this->assertSame(1, $run->updated_count);
        $this->assertSame(2, Product::count());
        $fan = DropShippingCatalogItem::where('product_code', '13293')->first();
        $this->assertSame('500.00', (string) ProductVariation::where('product_id', $fan->product_id)->value('selling_price'));
    }

    public function test_sold_out_products_are_archived_and_restored(): void
    {
        Queue::fake([ImportProductImage::class, SyncDropshippingPage::class]);
        $this->runSync();

        $item = DropShippingCatalogItem::where('product_code', '13293')->first();
        Product::whereKey($item->product_id)->update(['status' => 'active']);

        $this->panel[1]['stock'] = 0;
        $this->runSync();
        $this->assertSame('archived', Product::find($item->product_id)->status->value);
        $this->assertTrue($item->refresh()->hidden_by_sync);

        $this->panel[1]['stock'] = 3;
        $this->runSync();
        $this->assertSame('active', Product::find($item->product_id)->status->value);

        // Gone from the panel altogether.
        array_pop($this->panel);
        $run = $this->runSync();
        $this->assertSame(1, $run->hidden_count);
        $this->assertSame('archived', Product::find($item->product_id)->status->value);
    }

    public function test_a_draft_is_never_published_by_restock_and_sold_out_rows_are_not_imported(): void
    {
        Queue::fake([ImportProductImage::class, SyncDropshippingPage::class]);
        $this->panel[1]['stock'] = 0;
        $run = $this->runSync();

        $this->assertSame(1, $run->created_count);
        $this->assertSame(1, $run->skipped_count);
    }

    public function test_rejected_login_is_reported(): void
    {
        $this->rejectLogin = true;

        $this->actingAsRole('manager');
        $this->postJson('/api/v1/admin/products/import/dropshipping/test')
            ->assertStatus(422)
            ->assertJsonPath('message', 'The panel did not accept the phone number and password.');
    }

    public function test_admin_status_and_settings_never_return_the_password(): void
    {
        $this->actingAsRole('manager');

        $this->getJson('/api/v1/admin/products/import/dropshipping/status')
            ->assertOk()
            ->assertJsonPath('configured', true)
            ->assertJsonPath('settings.has_password', true)
            ->assertJsonMissingPath('settings.password');

        $this->putJson('/api/v1/admin/products/import/dropshipping/settings', ['sources' => "category_id=15\ncategory_id=9&sub_category_id=38 => smart-watch"])
            ->assertOk()
            ->assertJsonPath('sources.1', 'category_id=9&sub_category_id=38 => smart-watch');

        $this->assertSame('secret', app(DropshippingSettings::class)->password());
    }

    public function test_status_needs_permission(): void
    {
        $this->actingAsRole('support');
        $this->getJson('/api/v1/admin/products/import/dropshipping/status')->assertForbidden();
    }
}
