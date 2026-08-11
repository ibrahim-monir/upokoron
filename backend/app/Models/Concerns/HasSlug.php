<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * Generates a URL slug and keeps it unique.
 *
 * Slugs are generated once, on create, and are NOT regenerated when the name
 * changes. A live product URL that silently moves because someone fixed a typo
 * in the title breaks every inbound link and every share. Renaming the slug is
 * a deliberate act: pass one explicitly.
 */
trait HasSlug
{
    public static function bootHasSlug(): void
    {
        static::creating(function ($model): void {
            if (blank($model->slug)) {
                $model->slug = $model->generateSlug($model->{$model->slugSourceColumn()});
            } else {
                $model->slug = $model->generateSlug($model->slug);
            }
        });

        static::updating(function ($model): void {
            // Only when the caller changed it on purpose.
            if ($model->isDirty('slug') && filled($model->slug)) {
                $model->slug = $model->generateSlug($model->slug, $model->getKey());
            }
        });
    }

    public function slugSourceColumn(): string
    {
        return 'name';
    }

    /**
     * Bangla titles transliterate to an empty slug, so fall back to a short
     * random token rather than producing a row with slug "".
     */
    public function generateSlug(string $source, int|string|null $ignoreId = null): string
    {
        $base = Str::slug($source);

        if ($base === '') {
            $base = Str::lower(class_basename(static::class)).'-'.Str::random(6);
        }

        $slug = $base;
        $suffix = 1;

        while ($this->slugExists($slug, $ignoreId)) {
            $slug = $base.'-'.(++$suffix);
        }

        return $slug;
    }

    private function slugExists(string $slug, int|string|null $ignoreId): bool
    {
        $query = static::query()->where('slug', $slug);

        // Soft-deleted rows still hold their slug and the unique index still
        // sees them, so they must be counted here too.
        if (method_exists($this, 'trashed')) {
            $query->withTrashed();
        }

        if ($ignoreId !== null) {
            $query->whereKeyNot($ignoreId);
        }

        return $query->exists();
    }
}
