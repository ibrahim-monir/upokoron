<?php

declare(strict_types=1);

namespace App\Services\Catalog;

use App\Exceptions\BusinessRuleException;
use App\Models\Category;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CategoryService
{
    /** Deep trees are a navigation problem long before they are a data one. */
    public const MAX_DEPTH = 4;

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(array $data): Category
    {
        return DB::transaction(function () use ($data): Category {
            $parent = $this->parentFrom($data);

            $this->assertDepthAllowed($parent);

            return Category::create($data + ['depth' => $parent === null ? 0 : $parent->depth + 1]);
        });
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(Category $category, array $data): Category
    {
        return DB::transaction(function () use ($category, $data): Category {
            if (array_key_exists('parent_id', $data)) {
                $parent = $this->parentFrom($data);

                $this->assertNoCycle($category, $parent);
                $this->assertDepthAllowed($parent, $this->subtreeHeight($category));

                $data['depth'] = $parent === null ? 0 : $parent->depth + 1;
            }

            $category->update($data);

            // Moving a branch changes the depth of everything beneath it.
            if (array_key_exists('depth', $data)) {
                $this->recalculateDescendantDepth($category->refresh());
            }

            return $category->refresh();
        });
    }

    /**
     * Categories are never deleted out from under products.
     */
    public function delete(Category $category): void
    {
        if ($category->children()->exists()) {
            throw new BusinessRuleException(
                "Move or delete the sub-categories of [{$category->name}] first.",
                'category_has_children',
            );
        }

        $productCount = $category->products()->count() + $category->additionalProducts()->count();

        if ($productCount > 0) {
            throw new BusinessRuleException(
                "[{$category->name}] still has {$productCount} product(s). ".
                'Move them to another category, or deactivate this one instead of deleting it.',
                'category_has_products',
                ['product_count' => $productCount],
            );
        }

        $category->delete();
    }

    /**
     * The whole tree, nested, in one query.
     *
     * @return Collection<int, Category>
     */
    public function tree(bool $activeOnly = false): Collection
    {
        $all = Category::query()
            ->when($activeOnly, fn ($q) => $q->active())
            ->orderBy('position')
            ->orderBy('name')
            ->get();

        $byParent = $all->groupBy('parent_id');

        $attach = function (Collection $nodes) use (&$attach, $byParent): Collection {
            return $nodes->each(function (Category $node) use ($attach, $byParent): void {
                $node->setRelation('children', $attach($byParent->get($node->id, collect())));
            });
        };

        return $attach($byParent->get(null, collect()));
    }

    /**
     * A category cannot become its own descendant.
     *
     * Without this check, dragging a parent under its own child detaches the
     * whole branch from the tree: it still exists, but no root query can ever
     * reach it, and any recursive walk loops forever.
     */
    private function assertNoCycle(Category $category, ?Category $parent): void
    {
        if ($parent === null) {
            return;
        }

        if ($parent->id === $category->id) {
            throw new BusinessRuleException(
                'A category cannot be its own parent.',
                'category_cycle',
            );
        }

        if ($category->descendantIds()->contains($parent->id)) {
            throw new BusinessRuleException(
                "[{$parent->name}] sits underneath [{$category->name}], so it cannot also be its parent.",
                'category_cycle',
            );
        }
    }

    private function assertDepthAllowed(?Category $parent, int $extraHeight = 0): void
    {
        $depth = ($parent === null ? 0 : $parent->depth + 1) + $extraHeight;

        if ($depth >= self::MAX_DEPTH) {
            throw new BusinessRuleException(
                'Categories can be nested '.self::MAX_DEPTH.' levels deep at most.',
                'category_too_deep',
                ['max_depth' => self::MAX_DEPTH],
            );
        }
    }

    /** How many levels exist below this category. */
    private function subtreeHeight(Category $category): int
    {
        $ids = $category->descendantIds(includeSelf: false);

        if ($ids->isEmpty()) {
            return 0;
        }

        $deepest = Category::whereIn('id', $ids)->max('depth');

        return max(0, (int) $deepest - (int) $category->depth);
    }

    private function recalculateDescendantDepth(Category $category): void
    {
        $children = Category::where('parent_id', $category->id)->get();

        foreach ($children as $child) {
            $child->update(['depth' => $category->depth + 1]);
            $this->recalculateDescendantDepth($child);
        }
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function parentFrom(array $data): ?Category
    {
        $parentId = $data['parent_id'] ?? null;

        return $parentId === null ? null : Category::findOrFail($parentId);
    }
}
