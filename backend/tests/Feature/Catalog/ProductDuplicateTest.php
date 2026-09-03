<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Enums\ProductStatus;
use App\Models\Attribute;
use App\Models\AttributeValue;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariation;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Copying a product.
 *
 * The feature is a convenience, and the risk in a convenience is that it
 * quietly copies something it had no business copying. So most of what is
 * asserted here is what must NOT come across: the sales history, the rating,
 * the barcode, the SKU, and above all the published status -- a half-edited
 * clone appearing on the storefront at the original's price is the obvious
 * way for this to embarrass a shop.
 */
class ProductDuplicateTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);
        $this->category = Category::factory()->create(['name' => 'Electronics']);
    }

    private function makeProduct(): Product
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', [
            'name' => 'Fitness Band Slim',
            'category_id' => $this->category->id,
            'type' => 'simple',
            'status' => 'active',
            'selling_price' => '2150.00',
            'compare_at_price' => '2600.00',
            'warranty' => '6 months brand warranty',
            'barcode' => '8901234567890',
        ])->assertCreated();

        return Product::where('name', 'Fitness Band Slim')->sole();
    }

    public function test_a_copy_carries_the_description_of_the_goods(): void
    {
        $product = $this->makeProduct();

        $this->postJson("/api/v1/admin/products/{$product->id}/duplicate")->assertCreated();

        $copy = Product::with('defaultVariation')->where('id', '!=', $product->id)->sole();

        $this->assertSame('Fitness Band Slim (Copy)', $copy->name);
        $this->assertSame('fitness-band-slim-copy', $copy->slug);
        $this->assertSame($product->category_id, $copy->category_id);
        $this->assertSame('6 months brand warranty', $copy->warranty);
        $this->assertSame('2150.00', $copy->defaultVariation->selling_price);
        $this->assertSame('2600.00', $copy->defaultVariation->compare_at_price);
    }

    public function test_a_copy_lands_as_a_draft_and_never_on_the_storefront(): void
    {
        $product = $this->makeProduct();
        $product->forceFill(['is_featured' => true])->save();

        $this->postJson("/api/v1/admin/products/{$product->id}/duplicate")->assertCreated();

        $copy = Product::where('id', '!=', $product->id)->sole();

        $this->assertSame(ProductStatus::Draft, $copy->status);
        $this->assertNull($copy->published_at);
        $this->assertFalse($copy->is_featured);

        // The scope the storefront actually uses, rather than a re-reading of
        // the same two columns.
        $this->assertFalse(Product::published()->whereKey($copy->id)->exists());
    }

    public function test_a_copy_inherits_no_trading_history(): void
    {
        $product = $this->makeProduct();

        $product->forceFill([
            'sold_count' => '48.000',
            'rating_avg' => '4.80',
            'rating_count' => 200,
            'view_count' => 3100,
        ])->save();

        $this->postJson("/api/v1/admin/products/{$product->id}/duplicate")->assertCreated();

        $copy = Product::where('id', '!=', $product->id)->sole();

        $this->assertSame('0.000', $copy->sold_count);
        $this->assertSame('0.00', $copy->rating_avg);
        $this->assertSame(0, $copy->rating_count);
        $this->assertSame(0, (int) $copy->view_count);
    }

    /**
     * Both are unique columns, and both name a thing in the real world. A
     * barcode is printed on a box; the copy is not that box.
     */
    public function test_sku_is_regenerated_and_the_barcode_is_not_carried_over(): void
    {
        $product = Product::with('defaultVariation')->whereKey($this->makeProduct())->sole();
        $original = $product->defaultVariation;

        $this->postJson("/api/v1/admin/products/{$product->id}/duplicate")->assertCreated();

        $copy = Product::with('defaultVariation')->where('id', '!=', $product->id)->sole();
        $variation = $copy->defaultVariation;

        $this->assertNotSame($original->sku, $variation->sku);
        $this->assertNull($variation->barcode);
        $this->assertSame('8901234567890', $original->refresh()->barcode);
    }

    public function test_the_stock_of_the_original_stays_with_the_original(): void
    {
        $product = $this->makeProduct();

        $this->postJson("/api/v1/admin/products/{$product->id}/duplicate")->assertCreated();

        $copy = Product::where('id', '!=', $product->id)->sole();

        // Nothing was ever received against a product that has just been
        // invented, so it holds no stock rows at all.
        $this->assertSame(0, $copy->inventories()->count());
    }

    public function test_a_variable_product_copies_every_variation_and_its_options(): void
    {
        $this->actingAsRole('owner');

        $attribute = Attribute::create(['name' => 'Colour', 'type' => 'select', 'is_variant' => true]);
        $red = $attribute->values()->create(['value' => 'Red']);
        $blue = $attribute->values()->create(['value' => 'Blue']);

        $this->postJson('/api/v1/admin/products', [
            'name' => 'Braided Cable',
            'category_id' => $this->category->id,
            'type' => 'variable',
            'status' => 'active',
            'selling_price' => '450.00',
            'attributes' => [$attribute->id => [$red->id, $blue->id]],
        ])->assertCreated();

        $product = Product::with('variations')->where('name', 'Braided Cable')->sole();

        $this->assertCount(2, $product->variations);

        $this->postJson("/api/v1/admin/products/{$product->id}/duplicate")->assertCreated();

        $copy = Product::with('variations.attributeValues')
            ->where('id', '!=', $product->id)
            ->sole();

        $this->assertCount(2, $copy->variations);

        $options = $copy->variations
            ->flatMap(fn (ProductVariation $v) => $v->attributeValues->pluck('value'))
            ->sort()
            ->values()
            ->all();

        $this->assertSame(['Blue', 'Red'], $options);

        // Every SKU in the table is still unique, copies included.
        $this->assertSame(4, ProductVariation::query()->distinct()->count('sku'));
    }

    public function test_categories_specs_and_accessories_come_across(): void
    {
        $product = $this->makeProduct();

        $second = Category::factory()->create(['name' => 'Wearables']);
        $accessory = Product::factory()->create();

        $spec = AttributeValue::create([
            'attribute_id' => Attribute::create(['name' => 'Material', 'type' => 'select'])->id,
            'value' => 'Silicone',
        ]);

        $product->categories()->sync([$second->id]);
        $product->pairedProducts()->sync([$accessory->id => ['position' => 0]]);
        $product->attributeValues()->sync([$spec->id => ['attribute_id' => $spec->attribute_id]]);

        $this->postJson("/api/v1/admin/products/{$product->id}/duplicate")->assertCreated();

        $copy = Product::with(['categories', 'pairedProducts', 'attributeValues'])
            ->where('id', '!=', $product->id)
            ->where('id', '!=', $accessory->id)
            ->sole();

        $this->assertSame([$second->id], $copy->categories->pluck('id')->all());
        $this->assertSame([$accessory->id], $copy->pairedProducts->pluck('id')->all());
        $this->assertSame([$spec->id], $copy->attributeValues->pluck('id')->all());
    }

    public function test_the_copy_can_be_given_its_own_name_up_front(): void
    {
        $product = $this->makeProduct();

        $this->postJson("/api/v1/admin/products/{$product->id}/duplicate", [
            'name' => 'Fitness Band Pro',
        ])->assertCreated();

        $copy = Product::where('name', 'Fitness Band Pro')->sole();

        $this->assertSame('fitness-band-pro', $copy->slug);
    }

    public function test_an_account_that_cannot_create_products_cannot_copy_one(): void
    {
        $product = $this->makeProduct();

        // Reads the catalogue, creates nothing.
        $this->actingAsRole('accountant');

        $this->postJson("/api/v1/admin/products/{$product->id}/duplicate")->assertForbidden();

        $this->assertSame(1, Product::count());
    }
}
