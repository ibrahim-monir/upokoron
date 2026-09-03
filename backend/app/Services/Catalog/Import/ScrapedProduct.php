<?php

declare(strict_types=1);

namespace App\Services\Catalog\Import;

/**
 * What was found on a product page.
 *
 * Every field is optional, because every field is missing somewhere. This is
 * a draft handed to a person to correct, not a record -- so a half-filled one
 * is a useful answer and an exception is not.
 *
 * Field names match the admin product form, so the frontend can drop the
 * payload straight into it without a translation table in between.
 */
class ScrapedProduct
{
    /**
     * @param  array<int, string>  $images
     * @param  array<int, array{feature: string, description: string}>  $additional_info
     */
    public function __construct(
        public ?string $name = null,
        public ?string $sku = null,
        public ?string $brand = null,
        public ?string $selling_price = null,
        public ?string $compare_at_price = null,
        public ?string $currency = null,
        public ?string $short_description = null,
        public ?string $description = null,
        public array $images = [],
        public array $additional_info = [],
        public ?string $availability = null,
        public ?string $source_url = null,
        public ?string $source = null,
    ) {}

    /** Anything at all worth showing a person. A page with only a title is not. */
    public function isUsable(): bool
    {
        return filled($this->name) && ($this->selling_price !== null || $this->images !== [] || filled($this->description));
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'sku' => $this->sku,
            'brand' => $this->brand,
            'selling_price' => $this->selling_price,
            'compare_at_price' => $this->compare_at_price,
            'currency' => $this->currency,
            'short_description' => $this->short_description,
            'description' => $this->description,
            'images' => array_values($this->images),
            'additional_info' => array_values($this->additional_info),
            'availability' => $this->availability,
            'source_url' => $this->source_url,
            'source' => $this->source,
        ];
    }
}
