<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Models\Concerns\HasSlug;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Collection;

class Category extends Model
{
    use Auditable, HasFactory, HasSlug, SoftDeletes;

    protected $fillable = [
        'parent_id', 'name', 'slug', 'description', 'image', 'icon',
        // `depth` is derived, not user input: CategoryService computes it from
        // the parent and the controller's validator never accepts it. It is
        // fillable only so the service can write it.
        'depth',
        'position', 'is_active', 'is_featured', 'meta_title', 'meta_description',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_featured' => 'boolean',
            'depth' => 'integer',
            'position' => 'integer',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('position');
    }

    /** Products whose PRIMARY category is this one. */
    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    /** Products filed here as an additional category. */
    public function additionalProducts(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'product_categories');
    }

    /**
     * Every descendant, using a recursive CTE.
     *
     * A storefront listing for "Electronics" must include products filed under
     * "Electronics > Phones", so category filters resolve through this rather
     * than matching a single id.
     *
     * @return Collection<int, int>
     */
    public function descendantIds(bool $includeSelf = true): Collection
    {
        $ids = collect(
            $this->newQuery()->getConnection()->select(
                'WITH RECURSIVE tree AS (
                    SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL
                    UNION ALL
                    SELECT c.id FROM categories c
                    INNER JOIN tree t ON c.parent_id = t.id
                    WHERE c.deleted_at IS NULL
                )
                SELECT id FROM tree',
                [$this->id],
            )
        )->pluck('id')->map(fn ($id) => (int) $id);

        return $includeSelf ? $ids : $ids->reject(fn (int $id) => $id === $this->id)->values();
    }

    public function scopeRoots(Builder $query): Builder
    {
        return $query->whereNull('parent_id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }
}
