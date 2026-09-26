<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A kind of parcel that costs more to deliver -- "Heavy", "Fragile".
 *
 * Products carry at most one. Each delivery option says how much extra it
 * charges for it (see ShippingRate::chargeFor).
 */
class ShippingClass extends Model
{
    use Auditable;

    protected $fillable = ['name', 'slug', 'description'];

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }
}
