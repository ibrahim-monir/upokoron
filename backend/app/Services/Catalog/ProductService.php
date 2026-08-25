<?php

declare(strict_types=1);

namespace App\Services\Catalog;

use App\Enums\ProductType;
use App\Exceptions\BusinessRuleException;
use App\Models\AttributeValue;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Support\LocalDateTime;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Creates and updates products together with their variations.
 *
 * The rule that shapes this whole class: EVERY product ends up with at least
 * one variation row, including simple ones. Inventory, order items, and
 * purchase items all reference a variation, so guaranteeing one exists removes
 * a null check from every module that follows.
 */
class ProductService
{
    public function __construct(
        private readonly VariationGenerator $generator,
        private readonly SkuGenerator $skus,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Product
    {
        return DB::transaction(function () use ($data): Product {
            $product = Product::create($this->productAttributes($data) + ['created_by' => Auth::id()]);

            $this->syncCategories($product, $data);
            $this->syncPairings($product, $data);
            $this->syncSpecs($product, $data);
            $this->syncVariations($product, $data);

            return $this->loaded($product);
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Product $product, array $data): Product
    {
        return DB::transaction(function () use ($product, $data): Product {
            $product->update($this->productAttributes($data, $product));

            $this->syncCategories($product, $data);
            $this->syncPairings($product, $data);
            $this->syncSpecs($product, $data);
            $this->syncVariations($product->refresh(), $data);

            return $this->loaded($product);
        });
    }

    /**
     * Reconcile the variation set with what was submitted.
     *
     * Variations that disappear from the selection are DEACTIVATED and
     * soft-deleted, never hard-deleted. By Phase 8 they will be referenced by
     * order items and inventory ledger rows, and removing the row would orphan
     * a customer's order history. Soft-deleting also keeps the SKU reserved,
     * so re-adding the same combination later restores the original row rather
     * than colliding with it.
     *
     * @param  array<string, mixed>  $data
     */
    private function syncVariations(Product $product, array $data): void
    {
        $type = $product->type;

        if ($type === ProductType::Simple) {
            $this->syncSimpleVariation($product, $data);

            return;
        }

        $this->syncVariableVariations($product, $data);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function syncSimpleVariation(Product $product, array $data): void
    {
        $existing = ProductVariation::withTrashed()
            ->where('product_id', $product->id)
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get();

        $attributes = [
            'selling_price' => $data['selling_price'] ?? $existing->first()?->selling_price ?? '0.00',
            'compare_at_price' => $data['compare_at_price'] ?? null,
            'special_price' => $data['special_price'] ?? null,
            'special_starts_at' => LocalDateTime::toUtc($data['special_starts_at'] ?? null),
            'special_ends_at' => LocalDateTime::toUtc($data['special_ends_at'] ?? null),
            'barcode' => $data['barcode'] ?? null,
            'weight' => $data['weight'] ?? null,
            'is_default' => true,
            'is_active' => true,
            'position' => 0,
        ];

        $primary = $existing->first();

        if ($primary === null) {
            $product->variations()->create($attributes + [
                'sku' => filled($data['sku'] ?? null)
                    ? $data['sku']
                    : $this->skus->generate($product),
            ]);
        } else {
            if ($primary->trashed()) {
                $primary->restore();
            }

            if (filled($data['sku'] ?? null)) {
                $attributes['sku'] = $data['sku'];
            }

            $primary->update($attributes);
            $primary->attributeValues()->detach();
        }

        // A product converted from variable to simple keeps exactly one live
        // variation; the rest are retired but retained for history.
        $existing->skip(1)->each(function (ProductVariation $variation): void {
            $variation->update(['is_active' => false, 'is_default' => false]);

            if (! $variation->trashed()) {
                $variation->delete();
            }
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function syncVariableVariations(Product $product, array $data): void
    {
        /** @var array<int, array<int, int>> $selection */
        $selection = $data['attributes'] ?? [];

        $values = $this->generator->resolveValues($selection);
        $combinations = $this->generator->combinations($selection);

        if ($combinations === []) {
            throw new BusinessRuleException(
                'A variable product needs at least one attribute with a value selected.',
                'no_variant_attributes',
            );
        }

        $existing = ProductVariation::withTrashed()
            ->with('attributeValues')
            ->where('product_id', $product->id)
            ->get()
            ->keyBy(fn (ProductVariation $v) => $this->generator->key(
                $v->attributeValues->mapWithKeys(
                    fn ($value) => [(int) $value->pivot->attribute_id => (int) $value->id]
                )->all()
            ));

        $overrides = collect($data['variations'] ?? [])->keyBy('key');

        $keptKeys = [];
        $takenSkus = [];

        // Position comes from the loop index rather than a counter: an earlier
        // version incremented it after a `continue`, so every newly created
        // variation was left at position 0 and flagged as the default.
        foreach ($combinations as $position => $combination) {
            $key = $this->generator->key($combination);
            $keptKeys[] = $key;

            $override = $overrides->get($key, []);
            $labels = $this->generator->labels($combination, $values);

            /*
             * Product-level values are the starting point for every
             * variation, and an override replaces one.
             *
             * The offer fields used to be the exception: selling price and
             * weight fell back to the product, while the special price only
             * ever came from an override. So a shop that set an offer on a
             * variable product got a product with no offer at all -- no
             * error, no warning, just the normal price everywhere. The form
             * says "each variation can override it", and now that is true of
             * all of them rather than only some.
             */
            $attributes = [
                'name' => implode(' / ', $labels),
                'selling_price' => $override['selling_price'] ?? $data['selling_price'] ?? '0.00',
                'compare_at_price' => $override['compare_at_price'] ?? $data['compare_at_price'] ?? null,
                'special_price' => $override['special_price'] ?? $data['special_price'] ?? null,
                'special_starts_at' => LocalDateTime::toUtc($override['special_starts_at'] ?? $data['special_starts_at'] ?? null),
                'special_ends_at' => LocalDateTime::toUtc($override['special_ends_at'] ?? $data['special_ends_at'] ?? null),
                'barcode' => $override['barcode'] ?? null,
                'weight' => $override['weight'] ?? $data['weight'] ?? null,
                'is_default' => $position === 0,
                'is_active' => $override['is_active'] ?? true,
                'position' => $position,
            ];

            $variation = $existing->get($key);

            if ($variation === null) {
                $sku = filled($override['sku'] ?? null)
                    ? $override['sku']
                    : $this->skus->generate($product, $labels, $takenSkus);

                $takenSkus[] = $sku;

                $variation = $product->variations()->create($attributes + ['sku' => $sku]);

                $variation->attributeValues()->attach(
                    collect($combination)->mapWithKeys(
                        fn (int $valueId, int $attributeId) => [$valueId => ['attribute_id' => $attributeId]]
                    )->all()
                );

                continue;
            }

            // Reappeared after being removed: bring the original row back so
            // its stock ledger and order history stay attached to it.
            if ($variation->trashed()) {
                $variation->restore();
            }

            if (filled($override['sku'] ?? null)) {
                $attributes['sku'] = $override['sku'];
            }

            $variation->update($attributes);
        }

        $existing->reject(fn ($v, string $key) => in_array($key, $keptKeys, true))
            ->each(function (ProductVariation $variation): void {
                $variation->update(['is_active' => false, 'is_default' => false]);

                if (! $variation->trashed()) {
                    $variation->delete();
                }
            });

        $this->ensureExactlyOneDefault($product);
    }

    /**
     * Exactly one live variation must be the default, or the storefront has
     * nothing to price a product card against.
     */
    private function ensureExactlyOneDefault(Product $product): void
    {
        $live = $product->variations()->active()->orderBy('position')->get();

        if ($live->isEmpty()) {
            throw new BusinessRuleException(
                'A product must keep at least one active variation.',
                'no_active_variation',
            );
        }

        $product->variations()->whereKeyNot($live->first()->id)->update(['is_default' => false]);
        $live->first()->update(['is_default' => true]);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function productAttributes(array $data, ?Product $product = null): array
    {
        $attributes = collect($data)->only([
            'name', 'slug', 'category_id', 'brand_id', 'unit_id', 'type',
            'short_description', 'short_description_style', 'description', 'is_stock_tracked',
            'status', 'is_featured', 'published_at',
            'weight', 'length', 'width', 'height', 'warranty', 'additional_info',
            'meta_title', 'meta_description', 'meta_keywords', 'canonical_url',
        ])->all();

        // The admin form submits a bare wall-clock string with no timezone
        // of its own. Read as UTC (Carbon's default), it drifts by whatever
        // offset the admin's own browser happens to be in -- every edit of
        // an already-published product pushed its publish date further into
        // the future until the storefront quietly 404'd it. Converted here,
        // from the shop's own timezone, exactly once.
        if (array_key_exists('published_at', $attributes)) {
            $attributes['published_at'] = LocalDateTime::toUtc($attributes['published_at']);
        }

        // Publishing without an explicit date means "now", so a product does
        // not sit invisible because nobody filled the field in.
        if (($attributes['status'] ?? null) === 'active'
            && blank($attributes['published_at'] ?? null)
            && $product?->published_at === null) {
            $attributes['published_at'] = now();
        }

        return $attributes;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    /**
     * The accessories picked for this product.
     *
     * @param  array<string, mixed>  $data
     */
    private function syncPairings(Product $product, array $data): void
    {
        if (! array_key_exists('paired_product_ids', $data)) {
            return;
        }

        // A product paired with itself would offer the shopper the page they
        // are already on.
        $ids = collect($data['paired_product_ids'] ?? [])
            ->reject(fn ($id) => (int) $id === $product->id)
            ->unique()
            ->values();

        // The order they were sent in is the order the storefront shows them.
        $product->pairedProducts()->sync(
            $ids->mapWithKeys(fn ($id, $index) => [$id => ['position' => $index]])->all(),
        );
    }

    private function syncCategories(Product $product, array $data): void
    {
        if (! array_key_exists('category_ids', $data)) {
            return;
        }

        // The primary category lives on the product row; the pivot holds only
        // the extras, so it is never double-counted in a category listing.
        $extra = collect($data['category_ids'] ?? [])
            ->reject(fn ($id) => (int) $id === (int) $product->category_id)
            ->unique()
            ->all();

        $product->categories()->sync($extra);
    }

    /**
     * Descriptive, non-variant attributes.
     *
     * @param  array<string, mixed>  $data
     */
    private function syncSpecs(Product $product, array $data): void
    {
        if (! array_key_exists('specifications', $data)) {
            return;
        }

        $values = collect($data['specifications'] ?? [])->flatten()->unique();

        if ($values->isEmpty()) {
            $product->attributeValues()->detach();

            return;
        }

        $resolved = AttributeValue::whereIn('id', $values)->get();

        $product->attributeValues()->sync(
            $resolved->mapWithKeys(fn ($v) => [$v->id => ['attribute_id' => $v->attribute_id]])->all()
        );
    }

    private function loaded(Product $product): Product
    {
        return $product->fresh([
            'category', 'brand', 'unit', 'categories', 'images',
            'variations.attributeValues.attribute',
            'attributeValues.attribute',
        ]);
    }

    /**
     * @return Collection<int, ProductVariation>
     */
    public function activeVariations(Product $product): Collection
    {
        return $product->variations()->active()->orderBy('position')->get();
    }
}
