<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Support\Money;
use App\Support\Quantity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A delivery option within a zone, and what it costs.
 */
class ShippingRate extends Model
{
    use Auditable;

    protected $fillable = [
        'shipping_zone_id', 'name', 'description',
        'base_charge', 'per_kg_charge', 'free_above_subtotal',
        'min_days', 'max_days', 'supports_cod', 'is_active', 'position',
    ];

    protected function casts(): array
    {
        return [
            'base_charge' => 'decimal:2',
            'per_kg_charge' => 'decimal:2',
            'free_above_subtotal' => 'decimal:2',
            'supports_cod' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function zone(): BelongsTo
    {
        return $this->belongsTo(ShippingZone::class, 'shipping_zone_id');
    }

    /** What this option charges on top for each shipping class. */
    public function classes(): BelongsToMany
    {
        return $this->belongsToMany(ShippingClass::class, 'shipping_class_rates')
            ->withPivot('charge')
            ->withTimestamps();
    }

    /**
     * What this rate charges for a given basket.
     *
     * Free-above is checked against the SUBTOTAL, before delivery is added --
     * comparing against a total that already contains the delivery charge is
     * circular, and lands on the wrong side of the threshold for any order
     * sitting near it.
     */
    /**
     * @param  array<int, int>  $shippingClassIds  the classes of the products in the basket
     */
    public function chargeFor(Money $subtotal, ?Quantity $totalWeightKg = null, array $shippingClassIds = []): Money
    {
        if ($this->free_above_subtotal !== null
            && $subtotal->greaterThanOrEqual(Money::of($this->free_above_subtotal))) {
            return Money::zero();
        }

        $charge = Money::of($this->base_charge);

        // Weight is optional throughout the catalogue. Items with no weight
        // recorded contribute nothing rather than blocking the quote.
        if ($totalWeightKg !== null && $totalWeightKg->isPositive()
            && Money::of($this->per_kg_charge)->isPositive()) {
            $charge = $charge->plus(Money::of($this->per_kg_charge)->times($totalWeightKg->value()));
        }

        return $charge->plus($this->classCharge($shippingClassIds));
    }

    /**
     * The extra for the basket's shipping classes: the dearest one, once.
     *
     * Not the sum. Three heavy items go in one parcel, and a heavy item plus
     * a fragile one is still one delivery -- adding the extras together would
     * charge for trips the courier does not make. (WooCommerce's default,
     * "charge for the most expensive class", for the same reason.)
     *
     * @param  array<int, int>  $shippingClassIds
     */
    public function classCharge(array $shippingClassIds): Money
    {
        if ($shippingClassIds === []) {
            return Money::zero();
        }

        $highest = Money::zero();

        foreach ($this->classes as $class) {
            if (! in_array($class->id, $shippingClassIds, true)) {
                continue;
            }

            $extra = Money::of((string) $class->pivot->charge);

            if ($extra->greaterThan($highest)) {
                $highest = $extra;
            }
        }

        return $highest;
    }

    public function estimateLabel(): ?string
    {
        if ($this->min_days === null && $this->max_days === null) {
            return null;
        }

        if ($this->min_days !== null && $this->max_days !== null && $this->min_days !== $this->max_days) {
            return "{$this->min_days}-{$this->max_days} days";
        }

        $days = $this->max_days ?? $this->min_days;

        return $days === 1 ? '1 day' : "{$days} days";
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
