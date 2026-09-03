<?php

declare(strict_types=1);

namespace App\Services\Catalog\Import;

use App\Exceptions\BusinessRuleException;
use App\Jobs\ImportProductImage;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariation;
use App\Models\Unit;
use App\Services\Catalog\ProductService;
use Illuminate\Support\Str;
use Throwable;

/**
 * A supplier's price list, turned into products.
 *
 * The file is whatever the supplier sent, so the reader is deliberately
 * forgiving: it accepts comma, semicolon and tab files, it strips the BOM
 * Excel writes, and it matches column headings by meaning rather than by
 * exact spelling -- "Price", "price", "Selling Price" and "Rate" are one
 * column. Being strict here just moves the work to the shop owner, who would
 * have to hand-edit a file they did not write.
 *
 * Two things it is NOT forgiving about. A row that cannot be read is
 * reported and skipped rather than guessed at, because a product created with
 * the wrong price sells at the wrong price. And an existing product is
 * matched only by SKU: names collide, SKUs are the identifier the supplier
 * and the shop already agreed on.
 */
class ProductCsvImporter
{
    /**
     * Column headings this reader understands, by the field they mean.
     *
     * @var array<string, array<int, string>>
     */
    public const COLUMNS = [
        'name' => ['name', 'product', 'product name', 'title', 'item', 'item name', 'description short'],
        'sku' => ['sku', 'code', 'product code', 'item code', 'model', 'model no', 'part number', 'mpn'],
        'barcode' => ['barcode', 'ean', 'upc', 'gtin'],
        'selling_price' => ['selling price', 'price', 'rate', 'unit price', 'mrp', 'sale price', 'tp'],
        'compare_at_price' => ['compare at price', 'compare price', 'regular price', 'was price', 'old price', 'list price'],
        'special_price' => ['special price', 'offer price', 'discount price'],
        'category' => ['category', 'category name', 'group'],
        'brand' => ['brand', 'manufacturer', 'make'],
        'unit' => ['unit', 'uom'],
        'short_description' => ['short description', 'summary', 'excerpt'],
        'description' => ['description', 'details', 'long description', 'full description'],
        'weight' => ['weight', 'weight kg'],
        'warranty' => ['warranty'],
        'status' => ['status'],
        'images' => ['image', 'images', 'image url', 'image link', 'photo', 'picture'],
    ];

    public function __construct(private readonly ProductService $products) {}

    /**
     * @param  array{dry_run?: bool, create_missing?: bool, update_existing?: bool, default_status?: string, default_category_id?: int|null}  $options
     * @return array<string, mixed>
     */
    public function run(string $path, array $options = []): array
    {
        $dryRun = (bool) ($options['dry_run'] ?? false);
        $createMissing = (bool) ($options['create_missing'] ?? false);
        $updateExisting = (bool) ($options['update_existing'] ?? true);
        $defaultStatus = (string) ($options['default_status'] ?? 'draft');
        $defaultCategory = $options['default_category_id'] ?? null;

        $rows = $this->read($path);
        $results = [];
        $counts = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'failed' => 0, 'images' => 0];

        foreach ($rows as $number => $row) {
            try {
                $result = $this->handleRow($row, [
                    'dry_run' => $dryRun,
                    'create_missing' => $createMissing,
                    'update_existing' => $updateExisting,
                    'default_status' => $defaultStatus,
                    'default_category_id' => $defaultCategory,
                ]);
            } catch (BusinessRuleException $e) {
                $counts['failed']++;
                $results[] = ['row' => $number, 'action' => 'failed', 'name' => $row['name'] ?? null, 'sku' => $row['sku'] ?? null, 'message' => $e->getMessage()];

                continue;
            } catch (Throwable $e) {
                $counts['failed']++;
                $results[] = ['row' => $number, 'action' => 'failed', 'name' => $row['name'] ?? null, 'sku' => $row['sku'] ?? null, 'message' => $e->getMessage()];

                continue;
            }

            $counts[$result['action']] = ($counts[$result['action']] ?? 0) + 1;
            $counts['images'] += $result['images'];
            $results[] = ['row' => $number] + $result;
        }

        return [
            'dry_run' => $dryRun,
            'rows' => count($rows),
            'created' => $counts['created'],
            'updated' => $counts['updated'],
            'skipped' => $counts['skipped'],
            'failed' => $counts['failed'],
            'images_queued' => $counts['images'],
            // Enough to see what happened without shipping a 2000-row table
            // through the browser. Failures come first: they are the rows the
            // person actually has to do something about.
            'results' => array_slice(
                array_merge(
                    array_values(array_filter($results, fn (array $r) => $r['action'] === 'failed')),
                    array_values(array_filter($results, fn (array $r) => $r['action'] !== 'failed')),
                ),
                0,
                200,
            ),
        ];
    }

    /**
     * One row, already mapped to canonical keys.
     *
     * @param  array<string, string>  $row
     * @param  array<string, mixed>  $options
     * @return array{action: string, name: ?string, sku: ?string, message: string, images: int, product_id: ?int}
     */
    private function handleRow(array $row, array $options): array
    {
        $name = trim($row['name'] ?? '');
        $sku = trim($row['sku'] ?? '');
        $existing = $sku !== '' ? ProductVariation::where('sku', $sku)->first()?->product : null;

        if ($existing !== null && ! $options['update_existing']) {
            return ['action' => 'skipped', 'name' => $existing->name, 'sku' => $sku, 'message' => 'Already in the catalogue.', 'images' => 0, 'product_id' => $existing->id];
        }

        if ($existing === null && $name === '') {
            throw new BusinessRuleException('No product name, and no SKU that matches anything already here.', 'import_row_incomplete', [], 422);
        }

        $price = $this->money($row['selling_price'] ?? null);
        $compare = $this->money($row['compare_at_price'] ?? null);
        $special = $this->money($row['special_price'] ?? null);

        if ($existing === null && $price === null) {
            throw new BusinessRuleException('No price. A product cannot be created without one.', 'import_row_no_price', [], 422);
        }

        if ($price !== null && $compare !== null && (float) $compare <= (float) $price) {
            throw new BusinessRuleException('The compare-at price is not higher than the selling price.', 'import_row_bad_compare', [], 422);
        }

        if ($price !== null && $special !== null && (float) $special >= (float) $price) {
            throw new BusinessRuleException('The special price is not lower than the selling price.', 'import_row_bad_special', [], 422);
        }

        $images = $this->imageUrls($row['images'] ?? null);

        if ($options['dry_run']) {
            return [
                'action' => $existing === null ? 'created' : 'updated',
                'name' => $name !== '' ? $name : $existing?->name,
                'sku' => $sku ?: null,
                'message' => $existing === null ? 'Would be created.' : "Would update [{$existing->name}].",
                'images' => count($images),
                'product_id' => $existing?->id,
            ];
        }

        $product = $existing === null
            ? $this->create($row, $name, $sku, $price, $compare, $special, $options)
            : $this->update($existing, $row, $name, $price, $compare, $special);

        foreach ($images as $url) {
            ImportProductImage::dispatch($product->id, $url, $product->name);
        }

        return [
            'action' => $existing === null ? 'created' : 'updated',
            'name' => $product->name,
            'sku' => $sku ?: null,
            'message' => $existing === null ? 'Created as '.$product->status->value.'.' : 'Updated.',
            'images' => count($images),
            'product_id' => $product->id,
        ];
    }

    /**
     * @param  array<string, string>  $row
     * @param  array<string, mixed>  $options
     */
    private function create(array $row, string $name, string $sku, ?string $price, ?string $compare, ?string $special, array $options): Product
    {
        $categoryId = $this->categoryId($row['category'] ?? null, $options)
            ?? throw new BusinessRuleException(
                filled($row['category'] ?? null)
                    ? "No category called [{$row['category']}]. Create it first, or tick \"create missing categories\"."
                    : 'No category. Give the file a Category column, or pick a default one for the whole import.',
                'import_row_no_category',
                [],
                422,
            );

        return $this->products->create(array_filter([
            'name' => $name,
            'category_id' => $categoryId,
            'brand_id' => $this->brandId($row['brand'] ?? null, $options),
            'unit_id' => $this->unitId($row['unit'] ?? null),
            'type' => 'simple',
            'status' => $this->status($row['status'] ?? null, $options['default_status']),
            'short_description' => Str::limit($this->clean($row['short_description'] ?? ''), 480, '') ?: null,
            'description' => Str::limit($this->clean($row['description'] ?? ''), 60000, '') ?: null,
            'weight' => $this->number($row['weight'] ?? null),
            'warranty' => Str::limit($this->clean($row['warranty'] ?? ''), 120, '') ?: null,
            'sku' => $sku ?: null,
            'barcode' => trim($row['barcode'] ?? '') ?: null,
            'selling_price' => $price,
            'compare_at_price' => $compare,
            'special_price' => $special,
        ], fn ($value) => $value !== null));
    }

    /**
     * An update touches only the columns the file actually carried.
     *
     * This is why it does not go through ProductService::update(): that takes
     * the whole product as the form submits it, so a price-list row with
     * three columns in it would blank the description, the special price and
     * the weight of every product it touched.
     *
     * @param  array<string, string>  $row
     */
    private function update(Product $product, array $row, string $name, ?string $price, ?string $compare, ?string $special): Product
    {
        $attributes = array_filter([
            'name' => $name !== '' ? $name : null,
            'short_description' => Str::limit($this->clean($row['short_description'] ?? ''), 480, '') ?: null,
            'description' => Str::limit($this->clean($row['description'] ?? ''), 60000, '') ?: null,
            'weight' => $this->number($row['weight'] ?? null),
            'warranty' => Str::limit($this->clean($row['warranty'] ?? ''), 120, '') ?: null,
        ], fn ($value) => $value !== null);

        if ($attributes !== []) {
            $product->update($attributes);
        }

        $variation = $product->variations()->where('is_default', true)->first()
            ?? $product->variations()->orderBy('id')->first();

        $prices = array_filter([
            'selling_price' => $price,
            'compare_at_price' => $compare,
            'special_price' => $special,
        ], fn ($value) => $value !== null);

        if ($variation !== null && $prices !== []) {
            $variation->update($prices);
        }

        return $product->refresh();
    }

    /*
    |--------------------------------------------------------------------------
    | Reading the file
    |--------------------------------------------------------------------------
    */

    /**
     * @return array<int, array<string, string>>
     */
    private function read(string $path): array
    {
        $handle = @fopen($path, 'r');

        if ($handle === false) {
            throw new BusinessRuleException('That file could not be opened.', 'import_unreadable', [], 422);
        }

        try {
            $first = fgets($handle);

            if ($first === false) {
                throw new BusinessRuleException('That file is empty.', 'import_empty', [], 422);
            }

            // Excel writes a UTF-8 BOM, and it becomes part of the first
            // column's name -- which is how "Name" stops matching "Name".
            $first = preg_replace('/^\x{FEFF}/u', '', $first) ?? $first;
            $delimiter = $this->delimiter($first);

            $headings = str_getcsv(rtrim($first, "\r\n"), $delimiter, '"', '');
            $map = $this->mapHeadings($headings);

            if (! in_array('name', $map, true) && ! in_array('sku', $map, true)) {
                throw new BusinessRuleException(
                    'That file has no Name or SKU column, so there is no way to tell what each row is. '
                    .'The first row must be the column headings.',
                    'import_no_headings',
                    ['headings' => $headings],
                    422,
                );
            }

            $max = (int) config('upokoron.import.max_csv_rows', 2000);
            $rows = [];
            $number = 1;

            while (($values = fgetcsv($handle, 0, $delimiter, '"', '')) !== false) {
                $number++;

                // A trailing newline, or a row of empty cells Excel left behind.
                if ($values === [null] || array_filter($values, fn ($v) => trim((string) $v) !== '') === []) {
                    continue;
                }

                if (count($rows) >= $max) {
                    throw new BusinessRuleException(
                        "That file has more than {$max} rows. Split it, or raise IMPORT_MAX_CSV_ROWS.",
                        'import_too_many_rows',
                        ['max' => $max],
                        422,
                    );
                }

                $row = [];

                foreach ($map as $index => $field) {
                    $row[$field] = trim((string) ($values[$index] ?? ''));
                }

                $rows[$number] = $row;
            }

            if ($rows === []) {
                throw new BusinessRuleException('That file has headings but no rows.', 'import_no_rows', [], 422);
            }

            return $rows;
        } finally {
            fclose($handle);
        }
    }

    /** Whichever separator appears most in the heading line. Suppliers send all three. */
    private function delimiter(string $heading): string
    {
        $counts = [
            ',' => substr_count($heading, ','),
            ';' => substr_count($heading, ';'),
            "\t" => substr_count($heading, "\t"),
        ];

        arsort($counts);

        return array_key_first($counts);
    }

    /**
     * Heading text -> canonical field, by column index.
     *
     * @param  array<int, string|null>  $headings
     * @return array<int, string>
     */
    private function mapHeadings(array $headings): array
    {
        $map = [];

        foreach ($headings as $index => $heading) {
            $normalised = Str::of((string) $heading)
                ->replaceMatches('/[_\-]+/', ' ')
                ->replaceMatches('/[^a-z0-9 ]/i', '')
                ->squish()
                ->lower()
                ->value();

            if ($normalised === '') {
                continue;
            }

            foreach (self::COLUMNS as $field => $aliases) {
                if (in_array($normalised, $aliases, true) && ! in_array($field, $map, true)) {
                    $map[$index] = $field;

                    break;
                }
            }
        }

        return $map;
    }

    /*
    |--------------------------------------------------------------------------
    | Turning cells into values
    |--------------------------------------------------------------------------
    */

    /**
     * @param  array<string, mixed>  $options
     */
    private function categoryId(?string $name, array $options): ?int
    {
        $name = trim((string) $name);

        if ($name === '') {
            return $options['default_category_id'] !== null ? (int) $options['default_category_id'] : null;
        }

        $category = Category::whereRaw('LOWER(name) = ?', [Str::lower($name)])
            ->orWhere('slug', Str::slug($name))
            ->first();

        if ($category !== null) {
            return $category->id;
        }

        if (! $options['create_missing']) {
            return $options['default_category_id'] !== null ? (int) $options['default_category_id'] : null;
        }

        // Created at the root, inactive-safe defaults, for someone to file
        // properly afterwards. depth is normally CategoryService's to compute;
        // at the root it is zero by definition.
        return Category::create([
            'name' => Str::limit($name, 120, ''),
            'parent_id' => null,
            'depth' => 0,
            'is_active' => true,
        ])->id;
    }

    /**
     * @param  array<string, mixed>  $options
     */
    private function brandId(?string $name, array $options): ?int
    {
        $name = trim((string) $name);

        if ($name === '') {
            return null;
        }

        $brand = Brand::whereRaw('LOWER(name) = ?', [Str::lower($name)])
            ->orWhere('slug', Str::slug($name))
            ->first();

        if ($brand !== null) {
            return $brand->id;
        }

        return $options['create_missing']
            ? Brand::create(['name' => Str::limit($name, 120, ''), 'is_active' => true])->id
            : null;
    }

    private function unitId(?string $name): ?int
    {
        $name = trim((string) $name);

        if ($name === '') {
            return null;
        }

        return Unit::whereRaw('LOWER(name) = ?', [Str::lower($name)])
            ->orWhereRaw('LOWER(short_name) = ?', [Str::lower($name)])
            ->value('id');
    }

    private function status(?string $value, string $default): string
    {
        $value = Str::lower(trim((string) $value));

        return in_array($value, ['draft', 'active', 'archived'], true) ? $value : $default;
    }

    /** Money as a string, or null. Never 0.00 from an unreadable cell. */
    private function money(?string $value): ?string
    {
        $number = $this->number($value);

        return $number !== null && (float) $number >= 0 ? number_format((float) $number, 2, '.', '') : null;
    }

    private function number(?string $value): ?string
    {
        $value = trim((string) $value);

        if ($value === '') {
            return null;
        }

        $digits = str_replace(',', '', preg_replace('/[^0-9.,\-]/', '', $value) ?? '');

        return is_numeric($digits) ? $digits : null;
    }

    private function clean(string $value): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $value));
    }

    /**
     * @return array<int, string>
     */
    private function imageUrls(?string $value): array
    {
        $value = trim((string) $value);

        if ($value === '') {
            return [];
        }

        // Pipe first: a URL may legitimately contain a comma, and a supplier
        // that separates with commas never puts one inside a link.
        $parts = str_contains($value, '|') ? explode('|', $value) : explode(',', $value);

        $urls = [];

        foreach ($parts as $part) {
            $part = trim($part);

            if ($part !== '' && filter_var($part, FILTER_VALIDATE_URL) !== false) {
                $urls[] = $part;
            }
        }

        return array_slice(array_unique($urls), 0, (int) config('upokoron.import.max_images', 6));
    }
}
