<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A group of places that share a delivery charge.
 *
 * Auditable: changing a zone changes what every future customer pays, so it
 * belongs in the same trail as price and stock changes.
 */
class ShippingZone extends Model
{
    use Auditable;

    protected $fillable = [
        'name', 'slug', 'description', 'is_fallback', 'is_active', 'position',
    ];

    protected function casts(): array
    {
        return [
            'is_fallback' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function areas(): HasMany
    {
        return $this->hasMany(ShippingZoneArea::class);
    }

    public function rates(): HasMany
    {
        return $this->hasMany(ShippingRate::class)->orderBy('position')->orderBy('id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
