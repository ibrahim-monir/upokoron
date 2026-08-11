<?php

declare(strict_types=1);

namespace App\Services\Catalog;

use App\Exceptions\BusinessRuleException;
use App\Models\AttributeValue;
use Illuminate\Support\Collection;

/**
 * Expands selected attribute values into the set of variation combinations.
 *
 * Colour {Red, Blue} x Size {S, M, L} produces six variations. The count grows
 * multiplicatively, which is why there is a hard cap: a fourth attribute with
 * ten values each turns a mis-click into ten thousand SKUs, ten thousand
 * inventory rows, and a request that times out halfway through creating them.
 */
class VariationGenerator
{
    public const MAX_COMBINATIONS = 200;

    /**
     * @param  array<int, array<int, int>>  $selection  attribute_id => [attribute_value_id, ...]
     * @return array<int, array<int, int>> each row: attribute_id => attribute_value_id
     */
    public function combinations(array $selection): array
    {
        $selection = array_filter($selection, fn (array $values) => $values !== []);

        if ($selection === []) {
            return [];
        }

        $this->assertWithinLimit($selection);

        $combinations = [[]];

        foreach ($selection as $attributeId => $valueIds) {
            $expanded = [];

            foreach ($combinations as $combination) {
                foreach ($valueIds as $valueId) {
                    $expanded[] = $combination + [$attributeId => $valueId];
                }
            }

            $combinations = $expanded;
        }

        return $combinations;
    }

    /**
     * A stable key for a combination, used to match an incoming combination
     * against a variation that already exists. Sorted by attribute id so that
     * {colour: red, size: xl} and {size: xl, colour: red} produce the same key.
     *
     * @param  array<int, int>  $combination
     */
    public function key(array $combination): string
    {
        ksort($combination);

        return implode('|', array_map(
            fn ($attributeId, $valueId) => "{$attributeId}:{$valueId}",
            array_keys($combination),
            $combination,
        ));
    }

    /**
     * Human labels for a combination, in attribute order.
     *
     * @param  array<int, int>  $combination
     * @return array<int, string>
     */
    public function labels(array $combination, Collection $valuesById): array
    {
        ksort($combination);

        return collect($combination)
            ->map(fn (int $valueId) => $valuesById->get($valueId)?->value)
            ->filter()
            ->values()
            ->all();
    }

    /**
     * Load every attribute value referenced by a selection, keyed by id, and
     * verify each one really belongs to the attribute it was filed under.
     *
     * Without that check a caller could pair attribute "Colour" with the value
     * "XL" and produce a variation nobody can describe.
     *
     * @param  array<int, array<int, int>>  $selection
     * @return Collection<int, AttributeValue>
     */
    public function resolveValues(array $selection): Collection
    {
        $ids = collect($selection)->flatten()->unique()->values();

        if ($ids->isEmpty()) {
            return collect();
        }

        $values = AttributeValue::whereIn('id', $ids)->get()->keyBy('id');

        foreach ($selection as $attributeId => $valueIds) {
            foreach ($valueIds as $valueId) {
                $value = $values->get($valueId);

                if ($value === null) {
                    throw new BusinessRuleException(
                        "Attribute value [{$valueId}] does not exist.",
                        'unknown_attribute_value',
                    );
                }

                if ((int) $value->attribute_id !== (int) $attributeId) {
                    throw new BusinessRuleException(
                        "Value [{$value->value}] does not belong to the attribute it was listed under.",
                        'attribute_value_mismatch',
                        ['attribute_id' => $attributeId, 'attribute_value_id' => $valueId],
                    );
                }
            }
        }

        return $values;
    }

    /**
     * @param  array<int, array<int, int>>  $selection
     */
    private function assertWithinLimit(array $selection): void
    {
        $total = array_product(array_map('count', $selection));

        if ($total > self::MAX_COMBINATIONS) {
            throw new BusinessRuleException(
                sprintf(
                    'That selection would create %d variations, over the limit of %d. '.
                    'Reduce the attribute values, or split this into separate products.',
                    $total,
                    self::MAX_COMBINATIONS,
                ),
                'too_many_variations',
                ['requested' => $total, 'limit' => self::MAX_COMBINATIONS],
            );
        }
    }
}
