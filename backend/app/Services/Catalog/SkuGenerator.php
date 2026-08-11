<?php

declare(strict_types=1);

namespace App\Services\Catalog;

use App\Models\Product;
use App\Models\ProductVariation;
use Illuminate\Support\Str;

/**
 * Builds a readable, unique SKU when the admin does not supply one.
 *
 * Uniqueness is also enforced by a unique index on the column: this generator
 * avoids collisions, the index guarantees their absence. Two admins saving
 * products in the same second is exactly the case where "avoid" is not enough.
 */
class SkuGenerator
{
    /**
     * @param  array<int, string>  $valueLabels  attribute values, e.g. ['Red', 'XL']
     * @param  array<int, string>  $taken  SKUs allocated earlier in this same request
     */
    public function generate(Product $product, array $valueLabels = [], array $taken = []): string
    {
        $base = $this->baseFor($product);

        $suffix = collect($valueLabels)
            ->map(fn (string $label) => Str::upper(Str::substr(Str::slug($label, ''), 0, 4)))
            ->filter()
            ->implode('-');

        $candidate = $suffix === '' ? $base : "{$base}-{$suffix}";
        $candidate = Str::limit($candidate, 55, '');

        $sku = $candidate;
        $n = 1;

        while ($this->exists($sku) || in_array($sku, $taken, true)) {
            $sku = $candidate.'-'.(++$n);
        }

        return $sku;
    }

    private function baseFor(Product $product): string
    {
        $slug = Str::upper(Str::substr(Str::slug($product->name, ''), 0, 8));

        if ($slug === '') {
            // Bangla product names transliterate to nothing, so fall back to
            // the id rather than emitting an empty prefix.
            $slug = 'SKU';
        }

        return $slug.'-'.str_pad((string) $product->id, 4, '0', STR_PAD_LEFT);
    }

    private function exists(string $sku): bool
    {
        // withTrashed: a soft-deleted variation still occupies the unique index.
        return ProductVariation::withTrashed()->where('sku', $sku)->exists();
    }
}
