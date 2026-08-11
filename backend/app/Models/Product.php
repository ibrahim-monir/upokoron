<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ProductStatus;
use App\Enums\ProductType;
use App\Models\Concerns\Auditable;
use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Product extends Model
{
    use Auditable, HasFactory, HasSlug, SoftDeletes;

    protected $fillable = [
        'name', 'slug', 'category_id', 'brand_id', 'unit_id', 'type',
        'short_description', 'description', 'is_stock_tracked',
        'status', 'is_featured', 'published_at',
        'weight', 'length', 'width', 'height', 'warranty',
        'meta_title', 'meta_description', 'meta_keywords', 'canonical_url',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'type' => ProductType::class,
            'status' => ProductStatus::class,
            'is_stock_tracked' => 'boolean',
            'is_featured' => 'boolean',
            'published_at' => 'datetime',
            'weight' => 'decimal:3',
            'sold_count' => 'decimal:3',
            'rating_avg' => 'decimal:2',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'product_categories');
    }

    public function variations(): HasMany
    {
        return $this->hasMany(ProductVariation::class)->orderBy('position');
    }

    /**
     * The single variation a simple product carries. Also the fallback the
     * storefront prices against when a variable product has not been picked.
     */
    public function defaultVariation(): HasOne
    {
        return $this->hasOne(ProductVariation::class)->where('is_default', true);
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('position');
    }

    public function primaryImage(): HasOne
    {
        return $this->hasOne(ProductImage::class)->where('is_primary', true);
    }

    /** Descriptive specs that do not create SKUs. */
    public function attributeValues(): BelongsToMany
    {
        return $this->belongsToMany(AttributeValue::class, 'product_attribute_values')
            ->withPivot('attribute_id');
    }

    public function isVariable(): bool
    {
        return $this->type === ProductType::Variable;
    }

    /**
     * Visible on the storefront right now. Draft and archived products are
     * excluded, as are active ones scheduled for a future date.
     */
    public function scopePublished(Builder $query): Builder
    {
        return $query->where('status', ProductStatus::Active->value)
            ->where(fn (Builder $q) => $q->whereNull('published_at')->orWhere('published_at', '<=', now()));
    }

    public function scopeInCategory(Builder $query, Category $category): Builder
    {
        $ids = $category->descendantIds();

        return $query->where(fn (Builder $q) => $q->whereIn('category_id', $ids)
            ->orWhereHas('categories', fn (Builder $c) => $c->whereIn('categories.id', $ids)));
    }
}
