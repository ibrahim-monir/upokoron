<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use RuntimeException;

class InventoryTransaction extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'inventory_id',
        'product_variation_id',
        'type',
        'quantity',
        'unit_cost',
        'total_cost',
        'balance_quantity',
        'balance_value',
        'reference_type',
        'reference_id',
        'note',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'unit_cost' => 'decimal:6',
            'total_cost' => 'decimal:6',
            'balance_quantity' => 'decimal:3',
            'balance_value' => 'decimal:6',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (): void {
            throw new RuntimeException(
                'Inventory transactions are immutable.'
            );
        });

        static::deleting(function (): void {
            throw new RuntimeException(
                'Inventory transactions cannot be deleted.'
            );
        });
    }

    public function inventory(): BelongsTo
    {
        return $this->belongsTo(Inventory::class);
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(
            ProductVariation::class,
            'product_variation_id'
        );
    }

    public function reference(): MorphTo
    {
        return $this->morphTo(
            'reference',
            'reference_type',
            'reference_id'
        );
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isIncoming(): bool
    {
        return bccomp((string) $this->quantity, '0', 3) === 1;
    }

    public function isOutgoing(): bool
    {
        return bccomp((string) $this->quantity, '0', 3) === -1;
    }
}