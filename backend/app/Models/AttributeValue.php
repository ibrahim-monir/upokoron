<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class AttributeValue extends Model
{
    use Auditable;

    protected $fillable = ['attribute_id', 'value', 'slug', 'color_hex', 'position'];

    protected function casts(): array
    {
        return ['position' => 'integer'];
    }

    protected static function booted(): void
    {
        // Scoped to the attribute, so "Red" can exist under both Colour and
        // Ink Colour. HasSlug is global and would be wrong here.
        static::creating(function (self $value): void {
            if (blank($value->slug)) {
                $value->slug = Str::slug($value->value) ?: Str::random(8);
            }
        });
    }

    public function attribute(): BelongsTo
    {
        return $this->belongsTo(Attribute::class);
    }
}
