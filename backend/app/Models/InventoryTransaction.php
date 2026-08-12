<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\InventoryDirection;
use App\Enums\InventoryTransactionType;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use RuntimeException;

/**
 * One stock movement. Append-only and immutable, exactly like a journal line.
 *
 * Every change to `inventories` has a row here, so the stock ledger can always
 * be replayed to explain the current quantity and value (invariant I3).
 */
class InventoryTransaction extends Model
{
    public const UPDATED_AT = null;

    /** @var array<int, string> */
    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'type' => InventoryTransactionType::class,
            'direction' => InventoryDirection::class,
            'quantity' => 'decimal:3',
            'unit_cost' => 'decimal:6',
            'total_cost' => 'decimal:2',
            'quantity_before' => 'decimal:3',
            'quantity_after' => 'decimal:3',
            'value_before' => 'decimal:2',
            'value_after' => 'decimal:2',
            'average_cost_after' => 'decimal:6',
            'transacted_at' => 'datetime',
            'created_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::updating(function (self $t): void {
            throw new RuntimeException(
                'Inventory transactions are immutable. Post a reversing movement instead of editing #'.$t->id.'.'
            );
        });

        static::deleting(function (self $t): void {
            throw new RuntimeException(
                'Inventory transactions cannot be deleted. Post a reversing movement instead of removing #'.$t->id.'.'
            );
        });
    }

    public function inventory(): BelongsTo
    {
        return $this->belongsTo(Inventory::class);
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(ProductVariation::class, 'product_variation_id');
    }

    public function journalEntry(): BelongsTo
    {
        return $this->belongsTo(JournalEntry::class);
    }

    public function reference(): MorphTo
    {
        return $this->morphTo('reference', 'reference_type', 'reference_id');
    }

    public function quantityMoved(): Quantity
    {
        return Quantity::of($this->quantity);
    }

    /** Signed: positive for stock in, negative for stock out. */
    public function signedQuantity(): Quantity
    {
        $qty = $this->quantityMoved();

        return $this->direction === InventoryDirection::In ? $qty : Quantity::zero()->minus($qty);
    }

    public function costMoved(): Money
    {
        return Money::of($this->total_cost);
    }

    public function signedValue(): Money
    {
        $value = $this->costMoved();

        return $this->direction === InventoryDirection::In ? $value : $value->negated();
    }

    public function scopeOfType(Builder $query, InventoryTransactionType ...$types): Builder
    {
        return $query->whereIn('type', array_map(fn ($t) => $t->value, $types));
    }

    public function scopeBetween(Builder $query, ?string $from, ?string $to): Builder
    {
        return $query
            ->when($from, fn (Builder $q) => $q->whereDate('transacted_at', '>=', $from))
            ->when($to, fn (Builder $q) => $q->whereDate('transacted_at', '<=', $to));
    }
}
