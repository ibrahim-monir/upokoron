<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Jobs\ImportProductImage;
use App\Models\Category;
use App\Services\Catalog\CategoryService;
use App\Services\Catalog\Import\DropShippingCatalog;
use App\Services\Catalog\ProductService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class ImportDropShippingCatalog extends Command
{
    protected $signature = 'dropshipping:import-catalog';

    protected $description = 'Import the complete DropShipping.com.bd catalog as unpublished drafts';

    public function handle(DropShippingCatalog $catalog, ProductService $products, CategoryService $categories): int
    {
        $created = 0;
        $skipped = 0;
        $failed = 0;
        $root = $this->supplierRoot($categories);

        try {
            foreach ($catalog->allPages() as $batch) {
                $this->info("Reading supplier page {$batch['page']} of {$batch['last_page']}...");

                foreach ($batch['products'] as $item) {
                    try {
                        $result = DB::transaction(function () use ($item, $products, $categories, $root): array {
                            $providerId = $item['id'] ?? null;
                            if ($providerId === null || trim((string) $providerId) === '') {
                                throw new \RuntimeException('Supplier product has no stable id.');
                            }

                            $providerId = (string) $providerId;
                            $existing = DB::table('dropshipping_catalog_items')
                                ->where('provider', 'mohasagor')
                                ->where('provider_product_id', $providerId)
                                ->lockForUpdate()
                                ->first();

                            if ($existing !== null) {
                                DB::table('dropshipping_catalog_items')
                                    ->where('id', $existing->id)
                                    ->update([
                                        'provider_category_id' => isset($item['category_id']) ? (string) $item['category_id'] : null,
                                        'source_payload' => json_encode($item['source_payload'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                                        'last_seen_at' => now(),
                                        'updated_at' => now(),
                                    ]);

                                return ['created' => false, 'images' => [], 'name' => $item['name']];
                            }

                            $category = $this->supplierCategory($item, $root, $categories);
                            $price = $this->sellingPrice($item);
                            $sku = $this->sku($item, $providerId);

                            $product = $products->create([
                                'name' => Str::limit($item['name'], 200, ''),
                                'category_id' => $category->id,
                                'type' => 'simple',
                                // Dropship stock is held by the supplier. The
                                // feed exposes no quantity that could back a local ledger.
                                'is_stock_tracked' => false,
                                'status' => 'draft',
                                'description' => filled($item['details']) ? Str::limit($item['details'], 60000, '') : null,
                                'additional_info' => $this->sourceInfo($item),
                                'sku' => $sku,
                                'selling_price' => $price,
                            ]);

                            DB::table('dropshipping_catalog_items')->insert([
                                'provider' => 'mohasagor',
                                'provider_product_id' => $providerId,
                                'provider_category_id' => isset($item['category_id']) ? (string) $item['category_id'] : null,
                                'product_id' => $product->id,
                                'source_payload' => json_encode($item['source_payload'], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE),
                                'last_seen_at' => now(),
                                'created_at' => now(),
                                'updated_at' => now(),
                            ]);

                            foreach ($item['images'] as $image) {
                                ImportProductImage::dispatch($product->id, $image, $product->name);
                            }

                            return ['created' => true];
                        });

                        if ($result['created']) {
                            $created++;
                        } else {
                            $skipped++;
                        }
                    } catch (Throwable $exception) {
                        $failed++;
                        $this->warn('Skipped supplier item '.($item['id'] ?? 'unknown').': '.$exception->getMessage());
                    }
                }
            }
        } catch (Throwable $exception) {
            $this->error($exception->getMessage());
            return self::FAILURE;
        }

        $this->newLine();
        $this->info("Drafts created: {$created}; already imported: {$skipped}; failed: {$failed}.");
        $this->warn('Supplier category IDs are grouped under inactive placeholder categories. Review category names and variants before publishing drafts.');

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }

    private function supplierRoot(CategoryService $categories): Category
    {
        $root = Category::withTrashed()->where('slug', 'dropshipping-com-bd')->first();

        if ($root !== null) {
            if ($root->trashed()) $root->restore();
            return $root;
        }

        return $categories->create([
            'name' => 'DropShipping.com.bd',
            'slug' => 'dropshipping-com-bd',
            'description' => 'Imported supplier catalog categories. Review before activating.',
            'is_active' => false,
        ]);
    }

    /** @param array<string, mixed> $item */
    private function supplierCategory(array $item, Category $root, CategoryService $categories): Category
    {
        $sourceId = trim((string) ($item['category_id'] ?? 'unknown'));
        $name = trim((string) ($item['category_name'] ?? ''));
        if ($name === '') $name = 'Supplier category '.$sourceId;

        $slug = 'dropship-category-'.Str::slug($sourceId ?: 'unknown');
        $category = Category::withTrashed()->where('slug', $slug)->first();
        if ($category !== null) {
            if ($category->trashed()) $category->restore();
            return $category;
        }

        return $categories->create([
            'parent_id' => $root->id,
            'name' => Str::limit($name, 120, ''),
            'slug' => $slug,
            'description' => 'Supplier category ID: '.$sourceId.'. Rename after confirming the supplier category label.',
            'is_active' => false,
        ]);
    }

    /** @param array<string, mixed> $item */
    private function sellingPrice(array $item): string
    {
        foreach (['reselling_price', 'price', 'sale_price'] as $field) {
            if (isset($item[$field]) && is_numeric($item[$field]) && (float) $item[$field] >= 0) {
                return number_format((float) $item[$field], 2, '.', '');
            }
        }

        throw new \RuntimeException('Supplier item has no usable price.');
    }

    /** @param array<string, mixed> $item
     *  @return array<int, array{feature: string, description: string}>
     */
    private function sourceInfo(array $item): array
    {
        $rows = [
            ['feature' => 'Supplier product ID', 'description' => (string) $item['id']],
            ['feature' => 'Supplier category ID', 'description' => (string) ($item['category_id'] ?? 'unknown')],
            ['feature' => 'Supplier price', 'description' => (string) ($item['price'] ?? 'not provided')],
            ['feature' => 'Supplier sale price', 'description' => (string) ($item['sale_price'] ?? 'not provided')],
            ['feature' => 'Suggested reseller price', 'description' => (string) ($item['reselling_price'] ?? 'not provided')],
            ['feature' => 'Supplier discount', 'description' => (string) ($item['discount'] ?? 'not provided')],
        ];

        foreach ([
            'Supplier attribute IDs' => $item['product_attribute'] ?? [],
            'Supplier variant IDs' => $item['product_variant'] ?? [],
        ] as $label => $value) {
            $serialized = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]';
            $rows[] = [
                'feature' => $label,
                'description' => Str::limit($serialized, 255, '…'),
            ];
        }

        return $rows;
    }

    /** @param array<string, mixed> $item */
    private function sku(array $item, string $providerId): string
    {
        $code = trim((string) ($item['sku'] ?? ''));
        $base = Str::upper((string) preg_replace('/[^A-Za-z0-9_-]/', '-', $code ?: 'ITEM'));
        $base = Str::limit($base, 40, '');
        $id = Str::upper(substr(sha1($providerId), 0, 12));

        return 'DS-'.$base.'-'.$id;
    }
}
