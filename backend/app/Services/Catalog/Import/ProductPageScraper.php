<?php

declare(strict_types=1);

namespace App\Services\Catalog\Import;

use App\Exceptions\BusinessRuleException;
use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use Illuminate\Support\Str;

/**
 * Reading a product out of somebody else's product page.
 *
 * There is no scraping of layout here, and that is the whole design. Almost
 * every shop worth importing from runs WooCommerce, Shopify, or something
 * else that publishes schema.org Product data as JSON-LD -- because Google
 * requires it to show a price in search results. So one parser reads
 * thousands of shops, and it keeps working when they restyle the page.
 *
 * The order is: JSON-LD, then OpenGraph, then the page's own <h1> and
 * <title>. Each step only fills what the one before it left empty, so a shop
 * with partial markup still comes back usable.
 *
 * What comes out is a DRAFT for a person to check. Prices move, descriptions
 * are someone else's writing, and a picture on another shop's site is usually
 * their photograph -- none of that is decided here.
 */
class ProductPageScraper
{
    public function __construct(private readonly RemoteFetcher $fetcher) {}

    public function scrape(string $url): ScrapedProduct
    {
        ['body' => $html, 'mime' => $mime, 'url' => $finalUrl] = $this->fetcher->get($url);

        if ($mime !== '' && ! str_contains($mime, 'html') && ! str_contains($mime, 'xml')) {
            throw new BusinessRuleException(
                "That address is a {$mime}, not a web page.",
                'import_not_html',
                ['url' => $url, 'mime' => $mime],
                422,
            );
        }

        $xpath = $this->parse($html);

        $product = new ScrapedProduct(source_url: $finalUrl, source: parse_url($finalUrl, PHP_URL_HOST) ?: null);

        $this->fromJsonLd($xpath, $product);
        $this->fromMeta($xpath, $product);
        $this->fromDocument($xpath, $product);
        $this->fromSpecTables($xpath, $product);

        $product->images = $this->tidyImages($product->images, $finalUrl);
        $product->name = $this->withoutSiteSuffix($product->name, $xpath, $finalUrl);

        if (! $product->isUsable()) {
            throw new BusinessRuleException(
                'Nothing that looks like a product was found on that page. Check the address is a single '
                .'product, not a category or search page.',
                'import_no_product',
                ['url' => $finalUrl],
                422,
            );
        }

        return $product;
    }

    private function parse(string $html): DOMXPath
    {
        $document = new DOMDocument;

        // Real pages are full of unclosed tags; libxml complains about every
        // one of them and none of it is actionable.
        $previous = libxml_use_internal_errors(true);

        // The XML declaration is what makes libxml read the bytes as UTF-8.
        // Without it a Bangla product name comes back as mojibake.
        $document->loadHTML('<?xml encoding="utf-8" ?>'.$html, LIBXML_NOWARNING | LIBXML_NOERROR);

        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        return new DOMXPath($document);
    }

    /*
    |--------------------------------------------------------------------------
    | schema.org JSON-LD -- the good case
    |--------------------------------------------------------------------------
    */

    private function fromJsonLd(DOMXPath $xpath, ScrapedProduct $product): void
    {
        foreach ($this->jsonLdNodes($xpath) as $node) {
            if (! $this->isType($node, 'Product')) {
                continue;
            }

            $this->fill($product, 'name', $this->text($node['name'] ?? null));
            $this->fill($product, 'sku', $this->text($node['sku'] ?? $node['mpn'] ?? $node['gtin13'] ?? null));
            $this->fill($product, 'brand', $this->name($node['brand'] ?? null));
            $this->fill($product, 'description', $this->text($node['description'] ?? null));

            foreach ($this->urls($node['image'] ?? null) as $image) {
                $product->images[] = $image;
            }

            foreach ($this->offers($node['offers'] ?? null) as $key => $value) {
                $this->fill($product, $key, $value);
            }

            // WooCommerce and Shopify both publish the attributes table here.
            foreach ($this->arrayOf($node['additionalProperty'] ?? null) as $property) {
                $feature = $this->text($property['name'] ?? null);
                $value = $this->text($property['value'] ?? null);

                if (filled($feature) && filled($value)) {
                    $product->additional_info[] = [
                        'feature' => Str::limit($feature, 80, ''),
                        'description' => Str::limit($value, 255, ''),
                    ];
                }
            }

            // The first Product node on a page is the page's product. Later
            // ones are "related items", and taking their prices is how an
            // import ends up listing an accessory's price on the main item.
            return;
        }
    }

    /**
     * Every JSON-LD object on the page, with @graph and top-level arrays
     * flattened -- both are normal, and a Product hides inside either.
     *
     * @return array<int, array<string, mixed>>
     */
    private function jsonLdNodes(DOMXPath $xpath): array
    {
        $nodes = [];

        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $script) {
            $raw = trim($script->textContent);
            $decoded = json_decode($raw, true);

            /*
             * Shops write their description into this block with the line
             * breaks still in it, which is invalid JSON -- a raw newline
             * inside a string is exactly what the spec forbids -- so a strict
             * decode returns null and the page falls through to OpenGraph
             * with no price on it. Every control character is whitespace as
             * far as this document is concerned, so replacing them costs
             * nothing and rescues the block. Found on techshopbd.com, whose
             * markup is otherwise complete.
             */
            if (! is_array($decoded)) {
                $decoded = json_decode((string) preg_replace('/[\x00-\x1F]+/', ' ', $raw), true);
            }

            if (! is_array($decoded)) {
                continue;
            }

            $queue = array_is_list($decoded) ? $decoded : [$decoded];

            while ($queue !== []) {
                $item = array_shift($queue);

                if (! is_array($item)) {
                    continue;
                }

                if (isset($item['@graph']) && is_array($item['@graph'])) {
                    foreach ($item['@graph'] as $child) {
                        $queue[] = $child;
                    }
                }

                $nodes[] = $item;
            }
        }

        return $nodes;
    }

    /**
     * @param  array<string, mixed>  $node
     */
    private function isType(array $node, string $type): bool
    {
        $declared = $node['@type'] ?? null;

        foreach (is_array($declared) ? $declared : [$declared] as $candidate) {
            if (is_string($candidate) && strcasecmp(class_basename(str_replace('#', '/', $candidate)), $type) === 0) {
                return true;
            }
        }

        return false;
    }

    /**
     * Price, compare-at price, currency and availability out of an Offer.
     *
     * AggregateOffer (a range) gives lowPrice as the selling price, because
     * that is the number the shop advertises.
     *
     * @return array<string, string|null>
     */
    private function offers(mixed $offers): array
    {
        foreach ($this->arrayOf($offers) as $offer) {
            $price = $this->price($offer['price'] ?? $offer['lowPrice'] ?? null);

            if ($price === null) {
                continue;
            }

            $found = [
                'selling_price' => $price,
                'currency' => $this->text($offer['priceCurrency'] ?? null),
                'availability' => Str::afterLast((string) $this->text($offer['availability'] ?? null), '/') ?: null,
            ];

            // Not every shop publishes what the item used to cost, but the
            // ones that do put it here, and it is the struck-through price.
            $was = $this->price($offer['highPrice'] ?? null);

            if ($was !== null && (float) $was > (float) $price) {
                $found['compare_at_price'] = $was;
            }

            return $found;
        }

        return [];
    }

    /*
    |--------------------------------------------------------------------------
    | OpenGraph and friends -- the common fallback
    |--------------------------------------------------------------------------
    */

    private function fromMeta(DOMXPath $xpath, ScrapedProduct $product): void
    {
        $this->fill($product, 'name', $this->meta($xpath, 'og:title'));
        $this->fill($product, 'short_description', $this->meta($xpath, 'og:description') ?? $this->meta($xpath, 'description'));
        $this->fill($product, 'description', $this->meta($xpath, 'og:description') ?? $this->meta($xpath, 'description'));
        $this->fill($product, 'brand', $this->meta($xpath, 'product:brand') ?? $this->meta($xpath, 'og:brand'));
        $this->fill($product, 'sku', $this->meta($xpath, 'product:retailer_item_id'));
        $this->fill($product, 'currency', $this->meta($xpath, 'product:price:currency') ?? $this->meta($xpath, 'og:price:currency'));

        $this->fill($product, 'selling_price', $this->price(
            $this->meta($xpath, 'product:price:amount') ?? $this->meta($xpath, 'og:price:amount'),
        ));

        foreach ($xpath->query('//meta[@property="og:image" or @property="og:image:secure_url"]/@content') ?: [] as $attribute) {
            $product->images[] = $attribute->nodeValue ?? '';
        }
    }

    private function fromDocument(DOMXPath $xpath, ScrapedProduct $product): void
    {
        $this->fill($product, 'name', $this->first($xpath, '//h1'));
        $this->fill($product, 'name', $this->first($xpath, '//title'));

        // itemprop microdata, still emitted by older Magento and OpenCart shops.
        $this->fill($product, 'sku', $this->first($xpath, '//*[@itemprop="sku"]'));
        $this->fill($product, 'selling_price', $this->price(
            $this->attribute($xpath, '//*[@itemprop="price"]/@content') ?? $this->first($xpath, '//*[@itemprop="price"]'),
        ));

        if (blank($product->short_description) && filled($product->description)) {
            $product->short_description = Str::limit($product->description, 300);
        }
    }

    /**
     * Specification tables.
     *
     * A heuristic, and deliberately a narrow one: only tables the page itself
     * labels as specifications, only two-column rows, and a hard cap. A
     * generous version of this reads the site's navigation into the product's
     * Additional Information tab.
     */
    private function fromSpecTables(DOMXPath $xpath, ScrapedProduct $product): void
    {
        if ($product->additional_info !== []) {
            return;
        }

        $labelled = '//table[contains(translate(concat(@class," ",@id),"SPECIFATRBUDONL","specifatrbudonl"),"spec")'
            .' or contains(translate(concat(@class," ",@id),"SPECIFATRBUDONL","specifatrbudonl"),"attribute")'
            .' or contains(translate(concat(@class," ",@id),"SPECIFATRBUDONL","specifatrbudonl"),"additional")]//tr';

        foreach ($xpath->query($labelled) ?: [] as $row) {
            if (count($product->additional_info) >= 25) {
                return;
            }

            $cells = [];

            foreach ($row->childNodes as $cell) {
                if ($cell instanceof DOMElement && in_array(strtolower($cell->nodeName), ['th', 'td'], true)) {
                    $cells[] = $this->clean($cell->textContent);
                }
            }

            if (count($cells) === 2 && filled($cells[0]) && filled($cells[1])) {
                $product->additional_info[] = [
                    'feature' => Str::limit($cells[0], 80, ''),
                    'description' => Str::limit($cells[1], 255, ''),
                ];
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Small shared pieces
    |--------------------------------------------------------------------------
    */

    /** Absolute, unique, capped, and never a tracking pixel. */
    private function tidyImages(array $images, string $base): array
    {
        $seen = [];

        foreach ($images as $image) {
            $image = trim((string) $image);

            if ($image === '' || str_starts_with($image, 'data:')) {
                continue;
            }

            $absolute = $this->fetcher->resolveUrl($base, $image);

            // Only the ones we could actually fetch later, checked with the
            // same rule the fetcher uses, so a preview never offers an image
            // the import is going to refuse.
            try {
                $this->fetcher->assertSafe($absolute);
            } catch (BusinessRuleException) {
                continue;
            }

            $seen[strtok($absolute, '#')] = true;
        }

        return array_slice(array_keys($seen), 0, (int) config('upokoron.import.max_images', 6));
    }

    /**
     * "Arduino Uno R3 Price in BD | TechShopBD" -> "Arduino Uno R3 Price in BD".
     *
     * A page title is written for a search result, so it carries the shop's
     * name; a product name must not. Only a trailing piece that actually
     * matches the site is cut -- product names are full of separators
     * ("2-in-1", "5.5x2.1mm"), and a rule that trimmed at any dash would eat
     * them.
     */
    private function withoutSiteSuffix(?string $name, DOMXPath $xpath, string $url): ?string
    {
        if (blank($name)) {
            return $name;
        }

        $host = strtolower((string) preg_replace('/^www\./', '', (string) parse_url($url, PHP_URL_HOST)));

        $sites = array_filter([
            $this->meta($xpath, 'og:site_name'),
            $host,
            // techshopbd.com -> techshopbd, which is how the title spells it.
            strtok($host, '.') ?: null,
        ]);

        if (preg_match('/^(.*\S)\s*[|:·\x{2013}\x{2014}-]\s*([^|:·\x{2013}\x{2014}-]+)$/u', $name, $matches) !== 1) {
            return $name;
        }

        $normalise = static fn (string $value): string => strtolower((string) preg_replace('/[^a-z0-9]/i', '', $value));
        $tail = $normalise(trim($matches[2]));

        foreach ($sites as $site) {
            if ($tail !== '' && $tail === $normalise((string) $site)) {
                return trim($matches[1]);
            }
        }

        return $name;
    }

    /** Set a field only if it is still empty: earlier sources are better sources. */
    private function fill(ScrapedProduct $product, string $field, ?string $value): void
    {
        if (! property_exists($product, $field) || blank($value) || filled($product->{$field})) {
            return;
        }

        $product->{$field} = match ($field) {
            'name' => Str::limit($this->clean($value), 200, ''),
            'sku' => Str::limit($this->clean($value), 60, ''),
            'brand' => Str::limit($this->clean($value), 120, ''),
            'short_description' => Str::limit($this->clean($value), 480, ''),
            'description' => Str::limit($this->clean($value), 60000, ''),
            default => $this->clean($value),
        };
    }

    private function meta(DOMXPath $xpath, string $name): ?string
    {
        return $this->attribute($xpath, "//meta[@property='{$name}' or @name='{$name}']/@content");
    }

    private function attribute(DOMXPath $xpath, string $query): ?string
    {
        $found = $xpath->query($query);

        return $found && $found->length > 0 ? $this->clean((string) $found->item(0)?->nodeValue) : null;
    }

    private function first(DOMXPath $xpath, string $query): ?string
    {
        $found = $xpath->query($query);

        return $found && $found->length > 0 ? $this->clean($this->textOf($found->item(0))) : null;
    }

    private function textOf(?DOMNode $node): string
    {
        return $node?->textContent ?? '';
    }

    /** Tags out, entities decoded, runs of whitespace collapsed to one space. */
    private function clean(?string $value): string
    {
        if ($value === null) {
            return '';
        }

        $value = html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim((string) preg_replace('/\s+/u', ' ', str_replace("\u{a0}", ' ', $value)));
    }

    private function text(mixed $value): ?string
    {
        if (is_string($value) || is_int($value) || is_float($value)) {
            return $this->clean((string) $value) ?: null;
        }

        return null;
    }

    /** schema.org lets brand be "Sony" or {"@type":"Brand","name":"Sony"}. */
    private function name(mixed $value): ?string
    {
        if (is_array($value)) {
            $value = array_is_list($value) ? ($value[0] ?? null) : $value;
        }

        return is_array($value) ? $this->text($value['name'] ?? null) : $this->text($value);
    }

    /**
     * "৳1,250.00", "1250", "BDT 1 250,00" -> "1250.00".
     *
     * Returns null rather than 0 for anything unreadable: a product silently
     * imported at zero taka is the worst outcome this class can produce.
     */
    private function price(mixed $value): ?string
    {
        if (is_int($value) || is_float($value)) {
            return $value > 0 ? number_format((float) $value, 2, '.', '') : null;
        }

        if (! is_string($value)) {
            return null;
        }

        $digits = preg_replace('/[^0-9.,]/', '', $value) ?? '';

        if ($digits === '') {
            return null;
        }

        // Whichever separator comes last is the decimal point; the other is
        // thousands. "1.250,00" and "1,250.00" are the same number.
        $lastComma = strrpos($digits, ',');
        $lastDot = strrpos($digits, '.');

        if ($lastComma !== false && ($lastDot === false || $lastComma > $lastDot)) {
            $digits = str_replace(',', '.', str_replace('.', '', $digits));
        } else {
            $digits = str_replace(',', '', $digits);
        }

        // A trailing group of three after the separator was thousands after
        // all: "1.250" is one thousand two hundred and fifty, not 1.25.
        if (preg_match('/^\d+\.\d{3}$/', $digits) === 1 && ! str_contains($value, '.0')) {
            $digits = str_replace('.', '', $digits);
        }

        return is_numeric($digits) && (float) $digits > 0
            ? number_format((float) $digits, 2, '.', '')
            : null;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function arrayOf(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $items = array_is_list($value) ? $value : [$value];

        return array_values(array_filter($items, 'is_array'));
    }

    /**
     * schema.org image is a string, a list, or an ImageObject with a url.
     *
     * @return array<int, string>
     */
    private function urls(mixed $value): array
    {
        if (is_string($value)) {
            return [$value];
        }

        if (! is_array($value)) {
            return [];
        }

        $urls = [];

        foreach (array_is_list($value) ? $value : [$value] as $item) {
            if (is_string($item)) {
                $urls[] = $item;
            } elseif (is_array($item) && is_string($item['url'] ?? $item['contentUrl'] ?? null)) {
                $urls[] = $item['url'] ?? $item['contentUrl'];
            }
        }

        return $urls;
    }
}
