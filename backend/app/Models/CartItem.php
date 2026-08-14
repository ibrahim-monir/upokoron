<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Quantity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One line in a basket: what, and how many.
 *
 * There is no price column here, and that is deliberate -- see the migration.
 * The price is resolved from the catalogue every time the cart is read, so a
 * price change is reflected immediately and there is no stored figure for
 * checkout to trust by mistake.
 */
class CartItem extends Model
{
    protected $fillable = [
        'cart_id', 'product_variation_id', 'quantity', 'stock_reservation_id',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
        ];
    }

    public function cart(): BelongsTo
    {
        return $this->belongsTo(Cart::class);
    }

    public function variation(): BelongsTo
    {
        return $this->belongsTo(ProductVariation::class, 'product_variation_id');
    }

    public function reservation(): BelongsTo
    {
        return $this->belongsTo(StockReservation::class, 'stock_reservation_id');
    }

    public function quantity(): Quantity
    {
        return Quantity::of($this->quantity);
    }

    /**
     * Is the stock behind this line still being held for us?
     *
     * A line whose reservation has lapsed still shows, so the shopper sees
     * what they picked rather than an inexplicably empty basket -- but it
     * cannot be checked out until the stock is taken again.
     */
    public function isHeld(): bool
    {
        return $this->stock_reservation_id !== null
            && $this->reservation !== null
            && $this->reservation->status === 'active';
    }
}
