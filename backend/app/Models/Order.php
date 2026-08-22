<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\OrderStatus;
use App\Enums\PaymentStatus;
use App\Models\Concerns\Auditable;
use App\Support\Money;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A sale.
 *
 * Everything on it is a frozen copy: prices, the address, the delivery
 * charge, and the cost of the goods. Nothing here is recomputed from the
 * catalogue after the fact, because an invoice that changes when a price
 * changes is not an invoice.
 */
class Order extends Model
{
    use Auditable;

    /**
     * Deliberately empty. Nothing about an order may be mass-assigned from a
     * request: every figure on it is computed by OrderService from the cart
     * and the catalogue, and forceFill is how the services write it.
     */
    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class,
            'payment_status' => PaymentStatus::class,
            'subtotal' => 'decimal:2',
            'discount_total' => 'decimal:2',
            'coupon_discount' => 'decimal:2',
            'shipping_charge' => 'decimal:2',
            'extra_charge' => 'decimal:2',
            'total' => 'decimal:2',
            'paid_total' => 'decimal:2',
            'refunded_total' => 'decimal:2',
            'cost_total' => 'decimal:2',
            'weight_kg' => 'decimal:3',
            'placed_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'shipped_at' => 'datetime',
            'delivered_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'returned_at' => 'datetime',
        ];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function history(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->orderBy('id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }

    public function shippingZone(): BelongsTo
    {
        return $this->belongsTo(ShippingZone::class);
    }

    public function shippingRate(): BelongsTo
    {
        return $this->belongsTo(ShippingRate::class);
    }

    public function coupon(): BelongsTo
    {
        return $this->belongsTo(Coupon::class);
    }

    /** What the customer still owes. Never negative. */
    public function dueAmount(): Money
    {
        $due = Money::of($this->total)->minus(Money::of($this->paid_total));

        return $due->isNegative() ? Money::zero() : $due;
    }

    /**
     * Gross profit on this order.
     *
     * Uses the cost stored on the order, which is what it cost when it
     * shipped. Delivery is excluded from both sides: the charge collected is
     * shipping income, and what the courier bills is an expense -- netting
     * them into product margin hides both.
     */
    public function grossProfit(): Money
    {
        return Money::of($this->subtotal)->minus(Money::of($this->cost_total));
    }

    public function isEditable(): bool
    {
        return ! $this->status->hasShipped() && ! $this->status->isFinal();
    }

    /**
     * Orders somebody still has to do something about.
     *
     * Asked of the enum rather than listed here, so adding a step to the
     * lifecycle cannot quietly drop it out of every "open orders" count in
     * the app -- which is what a hand-written list does the moment the flow
     * grows.
     */
    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereIn('status', array_map(
            static fn (OrderStatus $status): string => $status->value,
            OrderStatus::inFlight(),
        ));
    }
}
