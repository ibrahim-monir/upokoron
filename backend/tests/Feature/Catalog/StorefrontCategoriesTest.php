<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * What the home page's category strips actually show -- the shop-facing
 * side of `is_featured`, as distinct from the admin CRUD covered in
 * TaxonomyTest.
 */
class StorefrontCategoriesTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_home_page_only_shows_categories_marked_featured(): void
    {
        $featured = Category::factory()->create(['is_featured' => true, 'position' => 0]);
        Product::factory()->create(['category_id' => $featured->id]);

        $notFeatured = Category::factory()->create(['is_featured' => false, 'position' => 1]);
        Product::factory()->create(['category_id' => $notFeatured->id]);

        $names = collect($this->getJson('/api/v1/shop/categories/featured')->assertOk()->json('data'))
            ->pluck('name');

        $this->assertTrue($names->contains($featured->name));
        $this->assertFalse($names->contains($notFeatured->name));
    }

    /**
     * A shop that has never opened the admin category screen to mark
     * anything as featured must not end up with an empty home page.
     */
    public function test_it_falls_back_to_every_active_category_when_none_are_featured(): void
    {
        $category = Category::factory()->create(['is_featured' => false, 'position' => 0]);
        Product::factory()->create(['category_id' => $category->id]);

        $this->getJson('/api/v1/shop/categories/featured')
            ->assertOk()
            ->assertJsonPath('data.0.name', $category->name);
    }

    public function test_an_inactive_category_never_shows_even_if_featured(): void
    {
        $category = Category::factory()->create(['is_featured' => true, 'is_active' => false]);
        Product::factory()->create(['category_id' => $category->id]);

        $names = collect($this->getJson('/api/v1/shop/categories/featured')->assertOk()->json('data'))
            ->pluck('name');

        $this->assertFalse($names->contains($category->name));
    }
}
