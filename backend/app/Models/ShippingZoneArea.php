<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One place inside a zone: a district, optionally narrowed to a city.
 */
class ShippingZoneArea extends Model
{
    use Auditable;

    protected $fillable = ['shipping_zone_id', 'district', 'city'];

    public function zone(): BelongsTo
    {
        return $this->belongsTo(ShippingZone::class, 'shipping_zone_id');
    }
}
