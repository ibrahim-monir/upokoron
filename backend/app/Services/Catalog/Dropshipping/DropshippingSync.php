<?php

declare(strict_types=1);

namespace App\Services\Catalog\Dropshipping;

use App\Enums\AttributeType;
use App\Enums\ProductStatus;
use App\Jobs\ImportProductImage;
use App\Models\Attribute;
use App\Models\AttributeValue;
use App\Models\Category;
use App\Models\DropShippingCatalogItem;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Services\Catalog\CategoryService;
use App\Services\Catalog\ProductService;
use App\Services\Catalog\VariationGenerator;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Turns panel product rows into Upokoron products and keeps them in step.
 *
 * - A product is recognised by its panel product code, so nothing is ever
 *   imported twice.
 * - New products arrive as drafts (or the status chosen in settings), with
 *   colour/size variations and the panel gallery.
 * - Every sync updates price and availability. A product that goes out of
 *   stock on the panel is archived; it comes back to active when stock
 *   returns, but only if the sync was the one that archived it.
 * - A product deleted in Upokoron is not brought back.
 */
class DropshippingSync
{
    public const PROVIDER = 'dropshipping_bd';

    /** Panel attribute IDs seen so far. Anything else becomes "Variant". */
    private const ATTRIBUTE_NAMES = [1 => 'Size', 2 => 'Color'];

    private ?Category $root = null;

    /** @var array<string, Category> */
    private array $categoryCache = [];

    public function __construct(
        private readonly DropshippingClient $client,
        private readonly DropshippingSettings $settings,
        private readonly ProductService $products,
        private readonly CategoryService $categories,
        private readonly VariationGenerator $generator,
    ) {}

    /** Whether the panel considers this row orderable. */
    public function inStock(array $raw): bool
    {
        if ((int) ($raw['status'] ?? 0) !== 1) {
            return false;
        }

        // 0 is sold out. The panel occasionally reports -1; treat that as
        // "not counted" rather than as sold out.
        return ! array_key_exists('stock', $raw) || $raw['stock'] === null || (int) $raw['stock'] !== 0;
    }

    public function retailPrice(array $raw): ?string
    {
        $fields = $this->settings->get('price_field') === 'price'
            ? ['price', 'reselling_price', 'reseller_price']
            : ['reselling_price', 'reseller_price', 'price'];

        foreach ($fields as $field) {
            if (isset($raw[$field]) && is_numeric($raw[$field]) && (float) $raw[$field] > 0) {
                return number_format((float) $raw[$field], 2, '.', '');
            }
        }

        return null;
    }

    private function costPrice(array $raw): ?string
    {
        foreach (['sale_price', 'purchase_price'] as $field) {
            if (isset($raw[$field]) && is_numeric($raw[$field]) && (float) $raw[$field] > 0) {
                return number_format((float) $raw[$field], 2, '.', '');
            }
        }

        return null;
    }

    private function compareAt(array $raw, string $price): ?string
    {
        if (! $this->settings->get('compare_at_from_regular')) {
            return null;
        }
        $regular = isset($raw['price']) && is_numeric($raw['price']) ? (float) $raw['price'] : 0.0;

        return $regular > (float) $price ? number_format($regular, 2, '.', '') : null;
    }

    /**
     * Create or update one panel row.
     *
     * @param  array<string, mixed>  $raw
     * @param  array{params: array<string, string>, target: string, label: string}  $source
     * @param  array<string, array<int|string, string>>  $names  category names from the listing
     * @return 'created'|'updated'|'unchanged'|'skipped'
     */
    public function process(array $raw, array $source, array $names, int $runId): string
    {
        $code = trim((string) ($raw['product_code'] ?? ''));
        if ($code === '') {
            throw new RuntimeException('Panel product '.($raw['id'] ?? '?').' has no product code.');
        }

        $item = DropShippingCatalogItem::query()
            ->where('provider', self::PROVIDER)
            ->where('product_code', $code)
            ->first();

        if ($item !== null) {
            return $this->update($item, $raw, $runId);
        }

        if (! $this->settings->get('import_new') || ! $this->inStock($raw) || $this->retailPrice($raw) === null) {
            return 'skipped';
        }

        return $this->create($code, $raw, $source, $names, $runId);
    }

    /** @param array<string, mixed> $raw */
    private function update(DropShippingCatalogItem $item, array $raw, int $runId): string
    {
        $inStock = $this->inStock($raw);
        $price = $this->retailPrice($raw);
        $cost = $this->costPrice($raw);
        $changed = false;

        DB::transaction(function () use ($item, $raw, $runId, $inStock, $price, $cost, &$changed): void {
            $product = $item->product_id ? Product::withTrashed()->find($item->product_id) : null;

            if ($product !== null && ! $product->trashed()) {
                if ($price !== null && ! $item->price_locked && (string) $item->retail_price !== $price) {
                    $compare = $this->compareAt($raw, $price);
                    ProductVariation::query()
                        ->where('product_id', $product->id)
                        ->update(['selling_price' => $price, 'compare_at_price' => $compare, 'updated_at' => now()]);
                    $changed = true;
                }

                if ($this->settings->get('hide_out_of_stock')) {
                    $changed = $this->applyStock($item, $product, $inStock) || $changed;
                }
            }

            $item->fill([
                'provider_product_id' => (string) ($raw['id'] ?? $item->provider_product_id),
                'provider_category_id' => isset($raw['sub_category_id']) ? (string) $raw['sub_category_id'] : $item->provider_category_id,
                'cost_price' => $cost,
                'retail_price' => $item->price_locked ? $item->retail_price : ($price ?? $item->retail_price),
                'supplier_stock' => isset($raw['stock']) ? (int) $raw['stock'] : null,
                'in_stock' => $inStock,
                'last_run_id' => $runId,
                'last_seen_at' => now(),
                'synced_at' => now(),
            ]);
            $item->save();
        });

        return $changed ? 'updated' : 'unchanged';
    }

    /** Archive on sell-out, restore on restock. Returns whether the product changed. */
    public function applyStock(DropShippingCatalogItem $item, Product $product, bool $inStock): bool
    {
        if (! $inStock && $product->status === ProductStatus::Active) {
            $product->update(['status' => ProductStatus::Archived->value]);
            $item->hidden_by_sync = true;

            return true;
        }

        if ($inStock && $item->hidden_by_sync) {
            if ($product->status === ProductStatus::Archived) {
                $product->update(['status' => ProductStatus::Active->value]);
            }
            $item->hidden_by_sync = false;

            return true;
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $raw
     * @param  array{params: array<string, string>, target: string, label: string}  $source
     * @param  array<string, array<int|string, string>>  $names
     */
    private function create(string $code, array $raw, array $source, array $names, int $runId): string
    {
        // The listing has no variants or gallery; the product search does.
        $full = $this->client->product($code) ?? $raw;
        $full += $raw;

        $price = (string) $this->retailPrice($full);
        $category = $this->targetCategory($full, $source, $names);
        $sku = $this->sku($category, $code);
        $name = $this->cleanName((string) ($full['name'] ?? ''));
        if ($name === '') {
            $name = 'Product '.$code;
        }

        $product = DB::transaction(function () use ($full, $raw, $code, $price, $category, $sku, $name, $runId): Product {
            $data = [
                'name' => Str::limit($name, 200, ''),
                'category_id' => $category->id,
                'is_stock_tracked' => false,
                'status' => $this->settings->get('new_status') === 'active' ? 'active' : 'draft',
                'description' => $this->cleanDescription((string) ($full['details'] ?? '')),
                'selling_price' => $price,
                'compare_at_price' => $this->compareAt($full, $price),
                'sku' => $sku,
                'type' => 'simple',
            ];

            $selection = $this->variantSelection((array) ($full['product_variant'] ?? []));
            if ($selection !== []) {
                $data['type'] = 'variable';
                $data['attributes'] = $selection;
                $data['variations'] = $this->variationSkus($selection, $sku);
            }

            $product = $this->products->create($data);

            DropShippingCatalogItem::create([
                'provider' => self::PROVIDER,
                'provider_product_id' => (string) ($full['id'] ?? $code),
                'product_code' => $code,
                'provider_category_id' => isset($full['sub_category_id']) ? (string) $full['sub_category_id'] : null,
                'product_id' => $product->id,
                'cost_price' => $this->costPrice($full),
                'retail_price' => $price,
                'supplier_stock' => isset($raw['stock']) ? (int) $raw['stock'] : null,
                'in_stock' => true,
                'last_run_id' => $runId,
                'source_payload' => $this->payload($full),
                'last_seen_at' => now(),
                'synced_at' => now(),
            ]);

            return $product;
        });

        foreach ($this->imageUrls($full) as $url) {
            ImportProductImage::dispatch($product->id, $url, $product->name);
        }

        return 'created';
    }

    /**
     * Panel variants grouped into this shop's attributes and values.
     *
     * @param  array<int, mixed>  $variants
     * @return array<int, array<int, int>> attribute id => value ids
     */
    private function variantSelection(array $variants): array
    {
        $grouped = [];
        foreach ($variants as $variant) {
            $label = trim((string) data_get($variant, 'variant.name', ''));
            if ($label === '') {
                continue;
            }
            $panelAttribute = (int) data_get($variant, 'attribute_id', 0);
            $grouped[self::ATTRIBUTE_NAMES[$panelAttribute] ?? 'Variant'][Str::lower($label)] = Str::title($label);
        }

        $selection = [];
        foreach ($grouped as $attributeName => $labels) {
            $attribute = $this->attribute($attributeName);
            foreach (array_values($labels) as $position => $label) {
                $selection[$attribute->id][] = $this->attributeValue($attribute, $label, $position)->id;
            }
            $selection[$attribute->id] = array_values(array_unique($selection[$attribute->id]));
        }

        return $selection;
    }

    private function attribute(string $name): Attribute
    {
        $attribute = Attribute::query()->whereRaw('LOWER(name) = ?', [Str::lower($name)])->first()
            ?? Attribute::query()->where('slug', Str::slug($name))->first();

        if ($attribute === null) {
            $attribute = Attribute::create([
                'name' => $name,
                'slug' => Str::slug($name),
                'type' => $name === 'Color' ? AttributeType::Color->value : AttributeType::Select->value,
                'is_variant' => true,
                'is_filterable' => true,
                'is_active' => true,
            ]);
        } elseif (! $attribute->is_variant) {
            $attribute->update(['is_variant' => true]);
        }

        return $attribute;
    }

    private function attributeValue(Attribute $attribute, string $label, int $position): AttributeValue
    {
        $slug = Str::slug($label) ?: substr(sha1($label), 0, 10);

        return AttributeValue::query()->firstOrCreate(
            ['attribute_id' => $attribute->id, 'slug' => $slug],
            ['value' => Str::limit($label, 100, ''), 'position' => $position],
        );
    }

    /**
     * SKUs for each variation: the product SKU plus the value labels.
     *
     * @param  array<int, array<int, int>>  $selection
     * @return array<int, array{key: string, sku: string}>
     */
    private function variationSkus(array $selection, string $base): array
    {
        $values = $this->generator->resolveValues($selection);
        $out = [];
        $taken = [];
        foreach ($this->generator->combinations($selection) as $combination) {
            $suffix = collect($this->generator->labels($combination, $values))
                ->map(fn (string $label) => Str::upper(Str::substr(Str::slug($label, ''), 0, 6)))
                ->filter()
                ->implode('-');
            $sku = $this->uniqueSku(Str::limit($base.($suffix !== '' ? '-'.$suffix : ''), 55, ''), $taken);
            $taken[] = $sku;
            $out[] = ['key' => $this->generator->key($combination), 'sku' => $sku];
        }

        return $out;
    }

    /** {site code}-{category id}-{panel code}, e.g. 01-12-13292. */
    public function sku(Category $category, string $code): string
    {
        $site = preg_replace('/[^0-9A-Za-z]/', '', (string) $this->settings->get('site_code')) ?: '01';
        $base = $site.'-'.str_pad((string) $category->id, 2, '0', STR_PAD_LEFT).'-'.$code;

        return $this->uniqueSku($base);
    }

    /** @param array<int, string> $taken */
    private function uniqueSku(string $candidate, array $taken = []): string
    {
        $sku = $candidate;
        $n = 1;
        while (in_array($sku, $taken, true) || ProductVariation::withTrashed()->where('sku', $sku)->exists()) {
            $sku = $candidate.'-'.(++$n);
        }

        return $sku;
    }

    /**
     * @param  array<string, mixed>  $raw
     * @param  array{params: array<string, string>, target: string, label: string}  $source
     * @param  array<string, array<int|string, string>>  $names
     */
    private function targetCategory(array $raw, array $source, array $names): Category
    {
        $target = trim($source['target']);
        if ($target !== '') {
            $found = ctype_digit($target)
                ? Category::find((int) $target)
                : Category::where('slug', $target)->first();
            if ($found === null) {
                throw new RuntimeException("Upokoron category [{$target}] in the Sources setting does not exist.");
            }

            return $found;
        }

        // Most specific panel category that the product has.
        foreach ([
            ['sub_sub_category_id', 'sub_sub_categories', 'dsbd-subsub-'],
            ['sub_category_id', 'sub_categories', 'dsbd-sub-'],
            ['category_id', 'categories', 'dsbd-cat-'],
        ] as [$field, $list, $prefix]) {
            $id = (string) ($raw[$field] ?? '');
            if ($id === '' || $id === '0') {
                continue;
            }

            return $this->supplierCategory($prefix.$id, $names[$list][$id] ?? '', $id);
        }

        return $this->supplierRoot();
    }

    private function supplierCategory(string $slug, string $name, string $panelId): Category
    {
        if (isset($this->categoryCache[$slug])) {
            return $this->categoryCache[$slug];
        }

        $category = Category::withTrashed()->where('slug', $slug)->first();
        if ($category !== null) {
            if ($category->trashed()) {
                $category->restore();
            }

            return $this->categoryCache[$slug] = $category;
        }

        $name = $this->cleanName($name);

        return $this->categoryCache[$slug] = $this->categories->create([
            'parent_id' => $this->supplierRoot()->id,
            'name' => Str::limit($name !== '' ? $name : 'Panel category '.$panelId, 120, ''),
            'slug' => $slug,
            'description' => 'DropShipping.com.bd panel category '.$panelId.'. Move these products into your own categories, or rename and activate this one.',
            'is_active' => false,
        ]);
    }

    private function supplierRoot(): Category
    {
        if ($this->root !== null) {
            return $this->root;
        }

        $root = Category::withTrashed()->where('slug', 'dropshipping-com-bd')->first();
        if ($root !== null) {
            if ($root->trashed()) {
                $root->restore();
            }

            return $this->root = $root;
        }

        return $this->root = $this->categories->create([
            'name' => 'DropShipping.com.bd',
            'slug' => 'dropshipping-com-bd',
            'description' => 'Products imported from the DropShipping.com.bd panel. Review before activating.',
            'is_active' => false,
        ]);
    }

    /** @return array<int, string> */
    private function imageUrls(array $raw): array
    {
        $max = max(1, (int) $this->settings->get('max_images'));
        $urls = [];

        foreach ((array) ($raw['product_image'] ?? []) as $image) {
            $url = $this->client->imageUrl(is_array($image) ? ($image['image'] ?? null) : (string) $image);
            if ($url !== null) {
                $urls[] = $url;
            }
        }
        if ($urls === []) {
            $thumb = $this->client->imageUrl($raw['thumbnail_img'] ?? null);
            if ($thumb !== null) {
                $urls[] = $thumb;
            }
        }

        return array_slice(array_values(array_unique($urls)), 0, $max);
    }

    private function cleanName(string $name): string
    {
        $name = html_entity_decode(strip_tags($name), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim((string) preg_replace('/\s+/u', ' ', $name));
    }

    private function cleanDescription(string $html): ?string
    {
        $html = (string) preg_replace('#<(script|style|iframe)[^>]*>.*?</\1>#is', '', $html);
        $html = strip_tags($html, '<p><br><ul><ol><li><strong><b><em><i><h2><h3><h4><table><thead><tbody><tr><td><th><span>');
        $html = (string) preg_replace('/\s(on\w+|style|class|id)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);
        $html = trim($html);

        return $html === '' ? null : Str::limit($html, 60000, '');
    }

    /** What is worth keeping from the panel row, without its long text. */
    private function payload(array $raw): array
    {
        return collect($raw)
            ->only(['id', 'product_code', 'name', 'category_id', 'sub_category_id', 'sub_sub_category_id',
                'price', 'sale_price', 'reselling_price', 'stock', 'status', 'slug', 'updated_at'])
            ->all();
    }
}
