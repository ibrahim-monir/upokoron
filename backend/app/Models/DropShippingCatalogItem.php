<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One supplier product linked to one Upokoron product. */
class DropShippingCatalogItem extends Model
{
    protected $table = 'dropshipping_catalog_items';

    protected $fillable = [
        'provider', 'provider_product_id', 'product_code', 'provider_category_id', 'product_id',
        'cost_price', 'retail_price', 'supplier_stock', 'in_stock', 'hidden_by_sync', 'price_locked',
        'last_run_id', 'source_payload', 'last_seen_at', 'synced_at',
    ];

    protected function casts(): array
    {
        return [
            'source_payload' => 'array',
            'cost_price' => 'decimal:2',
            'retail_price' => 'decimal:2',
            'supplier_stock' => 'integer',
            'in_stock' => 'boolean',
            'hidden_by_sync' => 'boolean',
            'price_locked' => 'boolean',
            'last_seen_at' => 'datetime',
            'synced_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class)->withTrashed();
    }
}
