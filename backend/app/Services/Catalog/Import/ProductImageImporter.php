<?php

declare(strict_types=1);

namespace App\Services\Catalog\Import;

use App\Exceptions\BusinessRuleException;
use App\Models\Product;
use App\Models\ProductImage;
use App\Services\Catalog\ProductImageService;
use App\Services\Media\MediaService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

/**
 * Copy a picture from someone else's server onto ours.
 *
 * Hotlinking would have been one line -- product_images.path already accepts
 * a URL. It is not done, because the picture then belongs to a site that can
 * rename it, block us, or replace it with something else entirely, and the
 * shop finds out when a customer does.
 *
 * The file goes through MediaService like any upload, so it gets the same
 * MIME sniffing, the same resize, the same de-duplication by content hash --
 * importing the same photo on twenty products stores it once.
 */
class ProductImageImporter
{
    public function __construct(
        private readonly RemoteFetcher $fetcher,
        private readonly MediaService $media,
        private readonly ProductImageService $images,
    ) {}

    public function import(Product $product, string $url, ?string $alt = null): ProductImage
    {
        ['body' => $bytes, 'mime' => $mime] = $this->fetcher->get($url, 'image/*');

        if (! str_starts_with($mime, 'image/')) {
            throw new BusinessRuleException(
                "That link is a {$mime}, not an image.",
                'import_not_an_image',
                ['url' => $url],
                422,
            );
        }

        $path = tempnam(sys_get_temp_dir(), 'upokoron-import-');

        if ($path === false) {
            throw new BusinessRuleException('Could not open a temporary file for the download.', 'import_temp_failed');
        }

        try {
            file_put_contents($path, $bytes);

            // The last-parameter `true` is "this did not come from a browser
            // upload". Without it Symfony rejects the file for not being in
            // the PHP upload directory, which it obviously is not.
            $file = new UploadedFile($path, $this->filenameFor($url), $mime, null, true);

            $media = $this->media->upload($file, 'products', $alt ?? $product->name);
        } finally {
            @unlink($path);
        }

        return $this->images->attachMedia($product, $media, $alt ?? $product->name);
    }

    /**
     * Import several, keeping what worked.
     *
     * One picture failing the minimum-resolution gate must not cost the shop
     * the other five, so each is caught on its own and the failures are
     * described rather than thrown.
     *
     * @param  array<int, string>  $urls
     * @return array{imported: int, failed: array<int, array{url: string, reason: string}>}
     */
    public function importMany(Product $product, array $urls, ?string $alt = null): array
    {
        $imported = 0;
        $failed = [];

        foreach (array_slice($urls, 0, (int) config('upokoron.import.max_images', 6)) as $url) {
            try {
                $this->import($product, $url, $alt);
                $imported++;
            } catch (BusinessRuleException $e) {
                $failed[] = ['url' => $url, 'reason' => $e->getMessage()];
            }
        }

        return ['imported' => $imported, 'failed' => $failed];
    }

    /**
     * A readable original_name for the library listing.
     *
     * MediaService generates the stored filename itself, so nothing here
     * reaches the filesystem -- this is only what a human sees in the picker.
     */
    private function filenameFor(string $url): string
    {
        $name = trim(basename((string) parse_url($url, PHP_URL_PATH)));

        return $name === '' ? 'imported-image' : Str::limit($name, 100, '');
    }
}
