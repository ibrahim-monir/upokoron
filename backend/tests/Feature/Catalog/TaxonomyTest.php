<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\Attribute;
use App\Models\AttributeValue;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Services\Catalog\CategoryService;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TaxonomyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(UnitSeeder::class);
    }

    // ─── Categories ──────────────────────────────────────────────────────

    public function test_a_category_tree_can_be_built(): void
    {
        $this->actingAsRole('owner');

        $root = $this->postJson('/api/v1/admin/categories', ['name' => 'Clothing'])
            ->assertCreated()->json('category.id');

        $this->postJson('/api/v1/admin/categories', ['name' => 'Panjabi', 'parent_id' => $root])
            ->assertCreated()
            ->assertJsonPath('category.depth', 1);

        $this->getJson('/api/v1/admin/categories?tree=1')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Clothing')
            ->assertJsonPath('data.0.children.0.name', 'Panjabi');
    }

    /**
     * Dragging a parent under its own child detaches the whole branch: it
     * still exists, but no root query reaches it and a recursive walk loops
     * forever.
     */
    public function test_a_category_cannot_become_its_own_descendant(): void
    {
        $this->actingAsRole('owner');

        $parent = Category::factory()->create(['name' => 'Clothing']);
        $child = Category::factory()->create(['name' => 'Panjabi', 'parent_id' => $parent->id, 'depth' => 1]);

        $this->putJson("/api/v1/admin/categories/{$parent->id}", [
            'name' => 'Clothing',
            'parent_id' => $child->id,
        ])->assertStatus(409)->assertJsonPath('code', 'category_cycle');

        $this->assertNull($parent->fresh()->parent_id);
    }

    public function test_a_category_cannot_be_its_own_parent(): void
    {
        $this->actingAsRole('owner');

        $category = Category::factory()->create();

        $this->putJson("/api/v1/admin/categories/{$category->id}", [
            'name' => $category->name,
            'parent_id' => $category->id,
        ])->assertStatus(409)->assertJsonPath('code', 'category_cycle');
    }

    public function test_nesting_deeper_than_the_limit_is_refused(): void
    {
        $this->actingAsRole('owner');

        $parentId = null;

        // MAX_DEPTH levels are allowed, giving depths 0 .. MAX_DEPTH-1.
        for ($i = 0; $i < CategoryService::MAX_DEPTH; $i++) {
            $parentId = $this->postJson('/api/v1/admin/categories', [
                'name' => "Level {$i}",
                'parent_id' => $parentId,
            ])->assertCreated()->assertJsonPath('category.depth', $i)->json('category.id');
        }

        // One more would be a level too far.
        $this->postJson('/api/v1/admin/categories', [
            'name' => 'Too deep',
            'parent_id' => $parentId,
        ])->assertStatus(409)->assertJsonPath('code', 'category_too_deep');
    }

    public function test_a_category_with_products_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $category = Category::factory()->create();
        Product::factory()->create(['category_id' => $category->id]);

        $this->deleteJson("/api/v1/admin/categories/{$category->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'category_has_products');
    }

    public function test_a_category_with_children_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $parent = Category::factory()->create();
        Category::factory()->create(['parent_id' => $parent->id, 'depth' => 1]);

        $this->deleteJson("/api/v1/admin/categories/{$parent->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'category_has_children');
    }

    public function test_categories_can_be_reordered(): void
    {
        $this->actingAsRole('owner');

        $a = Category::factory()->create(['position' => 0]);
        $b = Category::factory()->create(['position' => 1]);
        $c = Category::factory()->create(['position' => 2]);

        $this->postJson('/api/v1/admin/categories/reorder', ['order' => [$c->id, $a->id, $b->id]])
            ->assertOk();

        $this->assertSame(0, $c->fresh()->position);
        $this->assertSame(1, $a->fresh()->position);
        $this->assertSame(2, $b->fresh()->position);
    }

    /**
     * A batch clearing out several empty categories should not be blocked
     * just because one of them turns out to still have products under it.
     */
    public function test_bulk_delete_skips_categories_that_still_have_products(): void
    {
        $this->actingAsRole('owner');

        $empty = Category::factory()->create();
        $inUse = Category::factory()->create();
        Product::factory()->create(['category_id' => $inUse->id]);

        $response = $this->postJson('/api/v1/admin/categories/bulk', [
            'action' => 'delete',
            'ids' => [$empty->id, $inUse->id],
        ])->assertOk();

        $this->assertStringContainsString('1 category deleted', $response->json('message'));
        $this->assertSoftDeleted('categories', ['id' => $empty->id]);
        $this->assertDatabaseHas('categories', ['id' => $inUse->id, 'deleted_at' => null]);
    }

    public function test_descendant_ids_walks_the_whole_branch(): void
    {
        $root = Category::factory()->create();
        $child = Category::factory()->create(['parent_id' => $root->id, 'depth' => 1]);
        $grandchild = Category::factory()->create(['parent_id' => $child->id, 'depth' => 2]);
        $unrelated = Category::factory()->create();

        $ids = $root->descendantIds();

        $this->assertEqualsCanonicalizing([$root->id, $child->id, $grandchild->id], $ids->all());
        $this->assertNotContains($unrelated->id, $ids->all());
    }

    public function test_moving_a_branch_recalculates_descendant_depth(): void
    {
        $this->actingAsRole('owner');

        $a = Category::factory()->create(['name' => 'A']);
        $b = Category::factory()->create(['name' => 'B']);
        $child = Category::factory()->create(['name' => 'Child', 'parent_id' => $a->id, 'depth' => 1]);

        // Move A (with its child) underneath B.
        $this->putJson("/api/v1/admin/categories/{$a->id}", ['name' => 'A', 'parent_id' => $b->id])
            ->assertOk();

        $this->assertSame(1, $a->fresh()->depth);
        $this->assertSame(2, $child->fresh()->depth);
    }

    // ─── Brands ──────────────────────────────────────────────────────────

    public function test_a_brand_with_products_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $brand = Brand::factory()->create();
        Product::factory()->create(['brand_id' => $brand->id]);

        // brand_id is nullOnDelete, so an unguarded delete would silently
        // strip the brand from live products.
        $this->deleteJson("/api/v1/admin/brands/{$brand->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'brand_has_products');
    }

    public function test_an_unused_brand_can_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $brand = Brand::factory()->create();

        $this->deleteJson("/api/v1/admin/brands/{$brand->id}")->assertOk();
        $this->assertSoftDeleted('brands', ['id' => $brand->id]);
    }

    // ─── Attributes ──────────────────────────────────────────────────────

    public function test_an_attribute_can_be_created_with_its_values(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/attributes', [
            'name' => 'Colour',
            'type' => 'color',
            'values' => [
                ['value' => 'Red', 'color_hex' => '#FF0000'],
                ['value' => 'Blue', 'color_hex' => '#0000FF'],
            ],
        ])->assertCreated()->assertJsonCount(2, 'attribute.values');
    }

    public function test_the_same_value_may_exist_under_two_attributes(): void
    {
        $this->actingAsRole('owner');

        foreach (['Colour', 'Ink Colour'] as $name) {
            $this->postJson('/api/v1/admin/attributes', [
                'name' => $name,
                'type' => 'select',
                'values' => [['value' => 'Red']],
            ])->assertCreated();
        }

        // Uniqueness is scoped to the attribute, not global.
        $this->assertSame(2, AttributeValue::where('slug', 'red')->count());
    }

    public function test_an_attribute_used_by_a_variation_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $attribute = Attribute::create(['name' => 'Size', 'type' => 'select', 'is_variant' => true]);
        $value = $attribute->values()->create(['value' => 'XL']);
        $category = Category::factory()->create();

        $this->postJson('/api/v1/admin/products', [
            'name' => 'Shirt',
            'category_id' => $category->id,
            'type' => 'variable',
            'status' => 'active',
            'selling_price' => '500.00',
            'attributes' => [$attribute->id => [$value->id]],
        ])->assertCreated();

        $this->deleteJson("/api/v1/admin/attributes/{$attribute->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'attribute_in_use');
    }

    public function test_an_invalid_colour_hex_is_refused(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/attributes', [
            'name' => 'Colour',
            'type' => 'color',
            'values' => [['value' => 'Red', 'color_hex' => 'red']],
        ])->assertStatus(422)->assertJsonValidationErrors('values.0.color_hex');
    }

    // ─── Units ───────────────────────────────────────────────────────────

    public function test_units_are_seeded_with_correct_decimal_rules(): void
    {
        $this->actingAsRole('owner');

        $units = collect($this->getJson('/api/v1/admin/units')->assertOk()->json('data'));

        // Pieces cannot be sold in halves; kilograms can.
        $this->assertFalse($units->firstWhere('name', 'Piece')['allow_decimal']);
        $this->assertTrue($units->firstWhere('name', 'Kilogram')['allow_decimal']);
    }

    public function test_a_unit_in_use_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $product = Product::factory()->create();

        $this->deleteJson("/api/v1/admin/units/{$product->unit_id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'unit_in_use');
    }
}
