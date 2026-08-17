<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\Attribute;
use App\Models\AttributeValue;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Services\Inventory\InventoryService;
use Database\Seeders\ChartOfAccountsSeeder;
use Database\Seeders\FiscalYearSeeder;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductManagementTest extends TestCase
{
    use RefreshDatabase;

    private Category $category;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);
        $this->category = Category::factory()->create(['name' => 'Electronics']);
    }

    /**
     * @return array<string, mixed>
     */
    private function simplePayload(array $overrides = []): array
    {
        return array_merge([
            'name' => 'Cotton Panjabi',
            'category_id' => $this->category->id,
            'type' => 'simple',
            'status' => 'active',
            'selling_price' => '1200.00',
        ], $overrides);
    }

    /** @return array{attribute: Attribute, values: array<int, AttributeValue>} */
    private function makeAttribute(string $name, array $values): array
    {
        $attribute = Attribute::create(['name' => $name, 'type' => 'select', 'is_variant' => true]);

        $created = [];
        foreach ($values as $value) {
            $created[] = $attribute->values()->create(['value' => $value]);
        }

        return ['attribute' => $attribute, 'values' => $created];
    }

    // ─── Simple products ─────────────────────────────────────────────────

    /**
     * The rule the whole schema is built on: inventory, order items, and
     * purchase items all reference a variation, so one must always exist.
     */
    public function test_a_simple_product_still_gets_one_variation(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload())
            ->assertCreated()
            ->assertJsonPath('product.type', 'simple');

        $product = Product::firstWhere('name', 'Cotton Panjabi');

        $this->assertCount(1, $product->variations);
        $this->assertTrue($product->variations->first()->is_default);
        $this->assertSame('1200.00', $product->variations->first()->selling_price);
    }

    /**
     * The product form edits stock as a real ledger movement, so it has to
     * know what is on hand before it can work out the difference.
     */
    public function test_the_admin_product_carries_its_on_hand_stock(): void
    {
        $this->actingAsRole('owner');

        $id = $this->postJson('/api/v1/admin/products', $this->simplePayload())
            ->json('product.id');

        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);

        app(InventoryService::class)->openingStock(
            Product::find($id)->variations->first(),
            '12',
            '2400.00',
        );

        $this->getJson("/api/v1/admin/products/{$id}")
            ->assertOk()
            ->assertJsonPath('data.variations.0.stock.quantity', '12.000')
            ->assertJsonPath('data.variations.0.stock.average_cost', '200.000000')
            ->assertJsonPath('data.variations.0.stock.has_movements', true);
    }

    /**
     * A variation that has never moved is not the same as one that sold out.
     * Only the first may be entered as an opening balance, so the difference
     * has to survive the trip to the browser.
     */
    public function test_stock_reports_no_movements_before_anything_happens(): void
    {
        $this->actingAsRole('owner');

        $id = $this->postJson('/api/v1/admin/products', $this->simplePayload())
            ->json('product.id');

        $this->getJson("/api/v1/admin/products/{$id}")
            ->assertOk()
            ->assertJsonPath('data.variations.0.stock.quantity', '0.000')
            ->assertJsonPath('data.variations.0.stock.has_movements', false);
    }

    /**
     * The storefront loads the same inventory row to grey out sold-out items,
     * and shares this resource with the admin. Without the route gate that
     * hands every shopper the cost price and the on-hand count.
     */
    public function test_the_storefront_is_never_told_cost_or_on_hand_stock(): void
    {
        $this->seed(ChartOfAccountsSeeder::class);
        $this->seed(FiscalYearSeeder::class);

        $product = Product::factory()->create(['category_id' => $this->category->id]);

        app(InventoryService::class)->openingStock(
            $product->variations()->first(),
            '12',
            '2400.00',
        );

        $listing = $this->getJson('/api/v1/shop/products')->assertOk();

        $listing->assertJsonMissingPath('data.0.default_variation.stock');
        $this->assertStringNotContainsString('average_cost', $listing->getContent());

        $detail = $this->getJson("/api/v1/shop/products/{$product->slug}")->assertOk();

        $this->assertStringNotContainsString('average_cost', $detail->getContent());
    }

    public function test_a_sku_is_generated_when_none_is_given(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload())->assertCreated();

        $sku = Product::firstWhere('name', 'Cotton Panjabi')->variations->first()->sku;

        $this->assertNotEmpty($sku);
        $this->assertStringStartsWith('COTTONPA-', $sku);
    }

    public function test_a_slug_is_generated_and_kept_unique(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload())->assertCreated();
        $this->postJson('/api/v1/admin/products', $this->simplePayload())->assertCreated();

        $slugs = Product::orderBy('id')->pluck('slug')->all();

        $this->assertSame(['cotton-panjabi', 'cotton-panjabi-2'], $slugs);
    }

    /**
     * A live URL that moves because somebody fixed a typo in the title breaks
     * every inbound link and every share.
     */
    public function test_renaming_a_product_does_not_move_its_url(): void
    {
        $this->actingAsRole('owner');

        $id = $this->postJson('/api/v1/admin/products', $this->simplePayload())
            ->json('product.id');

        $this->putJson("/api/v1/admin/products/{$id}", $this->simplePayload(['name' => 'Cotton Panjabi Deluxe']))
            ->assertOk();

        $this->assertSame('cotton-panjabi', Product::find($id)->slug);
    }

    public function test_a_bangla_name_is_transliterated_into_a_readable_slug(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload(['name' => 'সুতির পাঞ্জাবি']))
            ->assertCreated();

        $this->assertSame('sutir-panjabi', Product::first()->slug);
    }

    /**
     * A name made only of symbols transliterates to nothing. Without the
     * fallback in HasSlug that writes a row with slug "", and the second such
     * product then collides on the unique index.
     */
    public function test_a_name_with_no_transliterable_characters_still_gets_a_slug(): void
    {
        $this->actingAsRole('owner');

        foreach (['★★★', '###'] as $name) {
            $this->postJson('/api/v1/admin/products', $this->simplePayload(['name' => $name]))
                ->assertCreated();
        }

        $slugs = Product::orderBy('id')->pluck('slug');

        $this->assertCount(2, $slugs->filter()->unique());
        $slugs->each(fn (string $slug) => $this->assertStringStartsWith('product-', $slug));
    }

    // ─── Pricing validation ──────────────────────────────────────────────

    public function test_a_compare_at_price_below_the_selling_price_is_refused(): void
    {
        $this->actingAsRole('owner');

        // Otherwise the storefront advertises a price rise as a discount.
        $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'selling_price' => '1200.00',
            'compare_at_price' => '1000.00',
        ]))->assertStatus(422)->assertJsonValidationErrors('compare_at_price');
    }

    public function test_a_special_price_above_the_selling_price_is_refused(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'special_price' => '1500.00',
            'special_ends_at' => now()->addWeek()->toDateTimeString(),
        ]))->assertStatus(422)->assertJsonValidationErrors('special_price');
    }

    public function test_a_special_price_must_have_an_end_date(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload(['special_price' => '900.00']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('special_ends_at');
    }

    public function test_the_effective_price_uses_an_active_special_price(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'special_price' => '900.00',
            'special_starts_at' => now()->subDay()->toDateTimeString(),
            'special_ends_at' => now()->addWeek()->toDateTimeString(),
        ]))->assertCreated();

        $variation = ProductVariation::first();

        $this->assertTrue($variation->hasActiveSpecialPrice());
        $this->assertSame('900.00', $variation->effectivePrice()->value());
    }

    public function test_an_expired_special_price_falls_back_to_the_selling_price(): void
    {
        $product = Product::factory()->create();

        $product->variations()->first()->update([
            'selling_price' => '1200.00',
            'special_price' => '900.00',
            'special_starts_at' => now()->subMonth(),
            'special_ends_at' => now()->subDay(),
        ]);

        $variation = $product->variations()->first()->fresh();

        $this->assertFalse($variation->hasActiveSpecialPrice());
        $this->assertSame('1200.00', $variation->effectivePrice()->value());
    }

    // ─── Variable products ───────────────────────────────────────────────

    public function test_a_variable_product_generates_the_cartesian_product(): void
    {
        $this->actingAsRole('owner');

        $colour = $this->makeAttribute('Colour', ['Red', 'Blue']);
        $size = $this->makeAttribute('Size', ['S', 'M', 'L']);

        $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'name' => 'T-Shirt',
            'type' => 'variable',
            'attributes' => [
                $colour['attribute']->id => collect($colour['values'])->pluck('id')->all(),
                $size['attribute']->id => collect($size['values'])->pluck('id')->all(),
            ],
        ]))->assertCreated();

        $product = Product::firstWhere('name', 'T-Shirt');

        // 2 colours x 3 sizes
        $this->assertCount(6, $product->variations);
        $this->assertSame(1, $product->variations->where('is_default', true)->count());
        $this->assertSame(6, $product->variations->pluck('sku')->unique()->count());
    }

    public function test_variation_names_are_built_from_their_attribute_values(): void
    {
        $this->actingAsRole('owner');

        $colour = $this->makeAttribute('Colour', ['Red']);
        $size = $this->makeAttribute('Size', ['XL']);

        $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'name' => 'T-Shirt',
            'type' => 'variable',
            'attributes' => [
                $colour['attribute']->id => [$colour['values'][0]->id],
                $size['attribute']->id => [$size['values'][0]->id],
            ],
        ]))->assertCreated();

        $this->assertSame('Red / XL', ProductVariation::first()->name);
    }

    public function test_a_variable_product_requires_at_least_one_attribute(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload(['type' => 'variable']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('attributes');
    }

    /**
     * A fourth attribute with ten values turns a mis-click into ten thousand
     * SKUs, ten thousand inventory rows, and a request that times out halfway
     * through creating them.
     */
    public function test_an_explosive_attribute_selection_is_refused(): void
    {
        $this->actingAsRole('owner');

        $attributes = [];
        foreach (['A', 'B', 'C'] as $name) {
            $made = $this->makeAttribute($name, range(1, 10));
            $attributes[$made['attribute']->id] = collect($made['values'])->pluck('id')->all();
        }

        // 10 x 10 x 10 = 1,000, over the 200 limit.
        $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'type' => 'variable',
            'attributes' => $attributes,
        ]))->assertStatus(409)->assertJsonPath('code', 'too_many_variations');

        $this->assertSame(0, Product::count());
    }

    public function test_an_attribute_value_from_the_wrong_attribute_is_refused(): void
    {
        $this->actingAsRole('owner');

        $colour = $this->makeAttribute('Colour', ['Red']);
        $size = $this->makeAttribute('Size', ['XL']);

        // Pairing "Colour" with the value "XL" produces a variation nobody
        // can describe.
        $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'type' => 'variable',
            'attributes' => [$colour['attribute']->id => [$size['values'][0]->id]],
        ]))->assertStatus(409)->assertJsonPath('code', 'attribute_value_mismatch');
    }

    /**
     * By Phase 8 a variation is referenced by order items and stock ledger
     * rows. Removing the row would orphan a customer's order history.
     */
    public function test_removing_a_variation_retires_it_rather_than_deleting_it(): void
    {
        $this->actingAsRole('owner');

        $colour = $this->makeAttribute('Colour', ['Red', 'Blue']);
        $ids = collect($colour['values'])->pluck('id')->all();

        $productId = $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'type' => 'variable',
            'attributes' => [$colour['attribute']->id => $ids],
        ]))->json('product.id');

        $this->assertSame(2, ProductVariation::where('product_id', $productId)->count());

        // Drop Blue.
        $this->putJson("/api/v1/admin/products/{$productId}", $this->simplePayload([
            'type' => 'variable',
            'attributes' => [$colour['attribute']->id => [$ids[0]]],
        ]))->assertOk();

        $this->assertSame(1, ProductVariation::where('product_id', $productId)->count());
        $this->assertSame(2, ProductVariation::withTrashed()->where('product_id', $productId)->count());
    }

    /**
     * The retired row still holds its SKU, so re-adding the combination must
     * restore the original rather than collide with it.
     */
    public function test_re_adding_a_removed_variation_restores_the_original_row(): void
    {
        $this->actingAsRole('owner');

        $colour = $this->makeAttribute('Colour', ['Red', 'Blue']);
        $ids = collect($colour['values'])->pluck('id')->all();

        $productId = $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'type' => 'variable',
            'attributes' => [$colour['attribute']->id => $ids],
        ]))->json('product.id');

        $blueId = ProductVariation::where('product_id', $productId)->where('name', 'Blue')->value('id');

        $payload = fn (array $valueIds) => $this->simplePayload([
            'type' => 'variable',
            'attributes' => [$colour['attribute']->id => $valueIds],
        ]);

        $this->putJson("/api/v1/admin/products/{$productId}", $payload([$ids[0]]))->assertOk();
        $this->putJson("/api/v1/admin/products/{$productId}", $payload($ids))->assertOk();

        $restored = ProductVariation::where('product_id', $productId)->where('name', 'Blue')->first();

        $this->assertSame($blueId, $restored->id);
        $this->assertSame(2, ProductVariation::withTrashed()->where('product_id', $productId)->count());
    }

    public function test_variation_preview_does_not_create_anything(): void
    {
        $this->actingAsRole('owner');

        $colour = $this->makeAttribute('Colour', ['Red', 'Blue']);
        $size = $this->makeAttribute('Size', ['S', 'M']);

        $this->postJson('/api/v1/admin/products/preview-variations', [
            'attributes' => [
                $colour['attribute']->id => collect($colour['values'])->pluck('id')->all(),
                $size['attribute']->id => collect($size['values'])->pluck('id')->all(),
            ],
        ])->assertOk()->assertJsonPath('count', 4);

        $this->assertSame(0, ProductVariation::count());
    }

    // ─── Lifecycle and permissions ───────────────────────────────────────

    public function test_deleting_a_product_archives_it_instead_of_removing_it(): void
    {
        $this->actingAsRole('owner');

        $id = $this->postJson('/api/v1/admin/products', $this->simplePayload())->json('product.id');

        $this->deleteJson("/api/v1/admin/products/{$id}")->assertOk();

        $this->assertSoftDeleted('products', ['id' => $id]);
        $this->assertSame('archived', Product::withTrashed()->find($id)->status->value);
    }

    public function test_a_restored_product_comes_back_as_a_draft(): void
    {
        $this->actingAsRole('owner');

        $id = $this->postJson('/api/v1/admin/products', $this->simplePayload())->json('product.id');
        $this->deleteJson("/api/v1/admin/products/{$id}")->assertOk();

        $this->postJson("/api/v1/admin/products/{$id}/restore")->assertOk();

        // Draft, not active: it should not silently reappear on the storefront.
        $this->assertSame('draft', Product::find($id)->status->value);
    }

    public function test_a_support_user_cannot_create_a_product(): void
    {
        $this->actingAsRole('support');

        $this->postJson('/api/v1/admin/products', $this->simplePayload())->assertForbidden();
    }

    public function test_a_stock_manager_can_create_but_not_delete_a_product(): void
    {
        $this->actingAsRole('stock_manager');

        $id = $this->postJson('/api/v1/admin/products', $this->simplePayload())
            ->assertCreated()
            ->json('product.id');

        $this->deleteJson("/api/v1/admin/products/{$id}")->assertForbidden();
    }

    public function test_products_can_be_filtered_by_category_including_descendants(): void
    {
        $this->actingAsRole('owner');

        $child = Category::factory()->create(['parent_id' => $this->category->id, 'depth' => 1]);

        Product::factory()->create(['category_id' => $this->category->id]);
        Product::factory()->create(['category_id' => $child->id]);

        // Listing a parent category must include products filed under its
        // children, or half the catalogue disappears from navigation.
        $this->getJson("/api/v1/admin/products?category_id={$this->category->id}")
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_publishing_without_a_date_publishes_now(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload())->assertCreated();

        $this->assertNotNull(Product::first()->published_at);
    }

    public function test_a_draft_product_is_not_published(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/products', $this->simplePayload(['status' => 'draft']))
            ->assertCreated();

        $this->assertSame(0, Product::published()->count());
    }

    public function test_a_publish_date_is_read_in_the_shops_own_timezone(): void
    {
        $this->actingAsRole('owner');

        $productId = $this->postJson('/api/v1/admin/products', $this->simplePayload([
            'published_at' => '2026-08-16T09:30',
        ]))->assertCreated()->json('product.id');

        // 09:30 in Dhaka (UTC+6) is 03:30 UTC.
        $this->assertSame('2026-08-16 03:30:00', Product::find($productId)->published_at->toDateTimeString());
    }

    /**
     * The admin form round-trips a product's publish date as a bare
     * "2026-08-16T09:30" wall-clock string with no timezone attached. Read
     * back as UTC instead of Dhaka time, every re-save of an untouched date
     * field silently pushed it six hours further into the future -- and,
     * eventually, past "now", which knocked the product off the storefront
     * with no error anywhere.
     */
    public function test_resaving_a_published_product_does_not_drift_its_publish_date(): void
    {
        $this->actingAsRole('owner');

        $productId = $this->postJson('/api/v1/admin/products', $this->simplePayload())
            ->assertCreated()->json('product.id');

        $product = Product::find($productId);
        $this->assertTrue($product->published_at->isPast());

        // Exactly what the admin form sends: the product's own published_at,
        // rendered as a Dhaka wall-clock string, resubmitted unchanged.
        $dhakaLocal = $product->published_at->clone()->setTimezone('Asia/Dhaka')->format('Y-m-d\TH:i');

        $this->putJson("/api/v1/admin/products/{$productId}", $this->simplePayload([
            'published_at' => $dhakaLocal,
        ]))->assertOk();

        $this->assertTrue($product->refresh()->published_at->isPast());
        $this->getJson("/api/v1/shop/products/{$product->slug}")->assertOk();
    }
}
