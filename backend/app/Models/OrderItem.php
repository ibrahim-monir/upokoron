<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line of a sale, with its cost frozen alongside its price.
 *
 * `unit_cost` is written once, when the goods leave, and is what every profit
 * figure for this line is calculated from afterwards. Recomputing it from the
 * variation's current average would rewrite last year's margin every time
 * a new delivery arrives at a different price.
 */
class OrderItem extends Model
{
    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'list_price' => 'decimal:2',
            'unit_price' => 'decimal:2',
            'unit_discount' => 'decimal:2',
            'line_total' => 'decimal:2',
            'line_discount' => 'decimal:2',
            'unit_cost' => 'decimal:6',
            'total_cost' => 'decimal:2',
            'quantity_returned' => 'decimal:3',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(ProductVariation::class, 'product_variation_id');
    }

    public function inventoryTransaction(): BelongsTo
    {
        return $this->belongsTo(InventoryTransaction::class);
    }

    public function quantity(): Quantity
    {
        return Quantity::of($this->quantity);
    }

    /** Still with the customer, i.e. not sent back. */
    public function quantityKept(): Quantity
    {
        return $this->quantity()->minus(Quantity::of($this->quantity_returned));
    }

    public function grossProfit(): Money
    {
        return Money::of($this->line_total)->minus(Money::of($this->total_cost ?? '0'));
    }
}
