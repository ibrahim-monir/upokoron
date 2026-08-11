<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\ProductStatus;
use App\Enums\ProductType;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\Unit;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    protected $model = Product::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = fake()->unique()->words(3, true);

        // Nullable columns are listed explicitly so a factory-built product is
        // fully hydrated -- see UserFactory for why that matters here.
        return [
            'name' => ucfirst($name),
            'category_id' => Category::factory(),
            'brand_id' => null,
            'unit_id' => Unit::query()->inRandomOrder()->value('id'),
            'type' => ProductType::Simple,
            'short_description' => fake()->sentence(),
            'description' => fake()->paragraph(),
            'is_stock_tracked' => true,
            'status' => ProductStatus::Active,
            'is_featured' => false,
            'published_at' => now(),
            'weight' => fake()->randomFloat(3, 0.1, 5),
            'length' => null,
            'width' => null,
            'height' => null,
            'warranty' => null,
            'meta_title' => null,
            'meta_description' => null,
            'meta_keywords' => null,
            'canonical_url' => null,
            'created_by' => null,
        ];
    }

    public function draft(): static
    {
        return $this->state(fn () => ['status' => ProductStatus::Draft, 'published_at' => null]);
    }

    public function variable(): static
    {
        return $this->state(fn () => ['type' => ProductType::Variable]);
    }

    public function withBrand(): static
    {
        return $this->state(fn () => ['brand_id' => Brand::factory()]);
    }

    /**
     * Products created directly through the factory bypass ProductService, so
     * they would have no variation at all. Since every other module assumes
     * one exists, the factory creates the default variation itself.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (Product $product): void {
            if ($product->type === ProductType::Simple && ! $product->variations()->exists()) {
                $product->variations()->create([
                    'sku' => 'SKU-'.$product->id.'-'.fake()->unique()->numerify('####'),
                    'selling_price' => fake()->randomFloat(2, 100, 5000),
                    'is_default' => true,
                    'is_active' => true,
                    'position' => 0,
                ]);
            }
        });
    }
}
