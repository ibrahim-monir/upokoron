<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AttributeType;
use App\Models\Concerns\Auditable;
use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Attribute extends Model
{
    use Auditable, HasSlug;

    protected $fillable = [
        'name', 'slug', 'type', 'is_variant', 'is_filterable', 'position', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'type' => AttributeType::class,
            'is_variant' => 'boolean',
            'is_filterable' => 'boolean',
            'is_active' => 'boolean',
            'position' => 'integer',
        ];
    }

    public function values(): HasMany
    {
        return $this->hasMany(AttributeValue::class)->orderBy('position');
    }

    /** Only variant attributes multiply into SKUs. */
    public function scopeVariant(Builder $query): Builder
    {
        return $query->where('is_variant', true);
    }
}
