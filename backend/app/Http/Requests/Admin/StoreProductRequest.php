<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Permission checked in the controller.
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $variationId = $this->route('product')?->variations()->pluck('id');

        return [
            'name' => ['required', 'string', 'max:200'],
            'slug' => ['nullable', 'string', 'max:220', Rule::unique('products', 'slug')->ignore($this->route('product'))],
            'category_id' => ['required', Rule::exists('categories', 'id')->whereNull('deleted_at')],
            'brand_id' => ['nullable', Rule::exists('brands', 'id')->whereNull('deleted_at')],
            'unit_id' => ['nullable', Rule::exists('units', 'id')],
            'type' => ['required', Rule::in(['simple', 'variable'])],

            'short_description' => ['nullable', 'string', 'max:500'],
            'short_description_style' => ['nullable', Rule::in(['paragraph', 'list'])],
            'description' => ['nullable', 'string', 'max:65000'],
            'is_stock_tracked' => ['sometimes', 'boolean'],

            'status' => ['required', Rule::in(['draft', 'active', 'archived'])],
            'is_featured' => ['sometimes', 'boolean'],
            'published_at' => ['nullable', 'date'],

            'weight' => ['nullable', 'numeric', 'min:0', 'max:9999999'],
            'length' => ['nullable', 'numeric', 'min:0'],
            'width' => ['nullable', 'numeric', 'min:0'],
            'height' => ['nullable', 'numeric', 'min:0'],
            'warranty' => ['nullable', 'string', 'max:120'],

            // Free-form Feature/Description rows for the storefront's
            // Additional Information tab.
            'additional_info' => ['sometimes', 'array'],
            'additional_info.*.feature' => ['required', 'string', 'max:80'],
            'additional_info.*.description' => ['required', 'string', 'max:255'],

            'meta_title' => ['nullable', 'string', 'max:160'],
            'meta_description' => ['nullable', 'string', 'max:320'],
            'meta_keywords' => ['nullable', 'string', 'max:255'],
            'canonical_url' => ['nullable', 'url', 'max:255'],

            'category_ids' => ['sometimes', 'array'],
            'category_ids.*' => [Rule::exists('categories', 'id')->whereNull('deleted_at')],

            // Descriptive specs. Do NOT create variations.
            'specifications' => ['sometimes', 'array'],
            'specifications.*' => ['array'],
            'specifications.*.*' => [Rule::exists('attribute_values', 'id')],

            // Simple-product pricing, and the fallback price for variations.
            'sku' => [
                'nullable', 'string', 'max:60',
                Rule::unique('product_variations', 'sku')->ignore($variationId?->first()),
            ],
            'barcode' => ['nullable', 'string', 'max:60'],
            'selling_price' => ['required', 'numeric', 'min:0', 'max:9999999999999'],
            'compare_at_price' => ['nullable', 'numeric', 'min:0'],
            'special_price' => ['nullable', 'numeric', 'min:0'],
            'special_starts_at' => ['nullable', 'date'],
            'special_ends_at' => ['nullable', 'date', 'after:special_starts_at'],

            // Variable products: attribute_id => [attribute_value_id, ...]
            'attributes' => ['required_if:type,variable', 'array'],
            'attributes.*' => ['array', 'min:1'],
            'attributes.*.*' => [Rule::exists('attribute_values', 'id')],

            // Per-combination overrides, keyed by "attrId:valueId|attrId:valueId".
            'variations' => ['sometimes', 'array'],
            'variations.*.key' => ['required', 'string'],
            'variations.*.sku' => ['nullable', 'string', 'max:60'],
            'variations.*.barcode' => ['nullable', 'string', 'max:60'],
            'variations.*.selling_price' => ['nullable', 'numeric', 'min:0'],
            'variations.*.compare_at_price' => ['nullable', 'numeric', 'min:0'],
            'variations.*.special_price' => ['nullable', 'numeric', 'min:0'],
            'variations.*.weight' => ['nullable', 'numeric', 'min:0'],
            'variations.*.is_active' => ['nullable', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $selling = $this->input('selling_price');

            // compare_at_price is the struck-through "was" price. Below the
            // selling price it advertises a price rise as a discount.
            $compare = $this->input('compare_at_price');

            if (is_numeric($selling) && is_numeric($compare) && (float) $compare <= (float) $selling) {
                $validator->errors()->add(
                    'compare_at_price',
                    'The compare-at price is what the item used to cost, so it must be higher than the selling price.',
                );
            }

            $special = $this->input('special_price');

            if (is_numeric($selling) && is_numeric($special) && (float) $special >= (float) $selling) {
                $validator->errors()->add(
                    'special_price',
                    'A special price must be lower than the selling price.',
                );
            }

            if (filled($special) && blank($this->input('special_ends_at'))) {
                $validator->errors()->add(
                    'special_ends_at',
                    'Give the special price an end date, or it never returns to the normal price.',
                );
            }

            // Duplicate SKUs inside one submission slip past the unique rule,
            // which only checks against rows already in the database.
            $skus = collect($this->input('variations', []))->pluck('sku')->filter();

            if ($skus->count() !== $skus->unique()->count()) {
                $validator->errors()->add('variations', 'Two variations were given the same SKU.');
            }
        });
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('attributes') && is_array($this->input('attributes'))) {
            // Drop attributes left with no values selected, so an empty group
            // does not count towards "variable products need attributes".
            $this->merge([
                'attributes' => array_filter(
                    $this->input('attributes'),
                    fn ($values) => is_array($values) && $values !== [],
                ),
            ]);
        }
    }
}
