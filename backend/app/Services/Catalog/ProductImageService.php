<?php

declare(strict_types=1);

namespace App\Services\Catalog;

use App\Exceptions\BusinessRuleException;
use App\Models\Product;
use App\Models\ProductImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Product image storage.
 *
 * Files go to the `uploads` disk, which is rooted at public/uploads and needs
 * no symlink -- `php artisan storage:link` fails on most cPanel hosts because
 * symlink() is disabled, and a deployment that depends on it breaks silently
 * with every image 404ing.
 */
class ProductImageService
{
    public const DISK = 'uploads';

    /** @var array<int, string> */
    private const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    /** @var array<int, string> */
    private const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

    public function upload(Product $product, UploadedFile $file, ?string $alt = null): ProductImage
    {
        $this->assertIsReallyAnImage($file);

        // Generated name, never the client's. A user-supplied filename is
        // attacker-controlled and has no business reaching the filesystem.
        $name = Str::uuid()->toString().'.'.$this->safeExtension($file);
        $directory = 'products/'.$product->id;

        $path = $file->storeAs($directory, $name, ['disk' => self::DISK]);

        return DB::transaction(function () use ($product, $path, $alt, $file): ProductImage {
            $isFirst = ! $product->images()->exists();

            return $product->images()->create([
                'disk' => self::DISK,
                'path' => $path,
                'alt' => $alt ?? $product->name,
                'size' => $file->getSize(),
                'position' => (int) $product->images()->max('position') + 1,
                'is_primary' => $isFirst,
            ]);
        });
    }

    /**
     * Attach an externally hosted image by URL, so a store can list products
     * before it has any upload pipeline configured.
     */
    public function attachUrl(Product $product, string $url, ?string $alt = null): ProductImage
    {
        return DB::transaction(function () use ($product, $url, $alt): ProductImage {
            $isFirst = ! $product->images()->exists();

            return $product->images()->create([
                'disk' => self::DISK,
                'path' => $url,
                'alt' => $alt ?? $product->name,
                'position' => (int) $product->images()->max('position') + 1,
                'is_primary' => $isFirst,
            ]);
        });
    }

    public function delete(ProductImage $image): void
    {
        DB::transaction(function () use ($image): void {
            $product = $image->product;
            $wasPrimary = $image->is_primary;

            if (! str_starts_with($image->path, 'http')) {
                Storage::disk($image->disk)->delete($image->path);
            }

            $image->delete();

            // Never leave a product with images but no primary one.
            if ($wasPrimary) {
                $product->images()->orderBy('position')->first()?->update(['is_primary' => true]);
            }
        });
    }

    public function makePrimary(ProductImage $image): void
    {
        DB::transaction(function () use ($image): void {
            ProductImage::where('product_id', $image->product_id)->update(['is_primary' => false]);
            $image->update(['is_primary' => true]);
        });
    }

    /**
     * @param  array<int, int>  $orderedIds
     */
    public function reorder(Product $product, array $orderedIds): void
    {
        DB::transaction(function () use ($product, $orderedIds): void {
            foreach (array_values($orderedIds) as $position => $id) {
                $product->images()->whereKey($id)->update(['position' => $position]);
            }
        });
    }

    /**
     * A .php file renamed to .jpg passes an extension check. Verifying the
     * real MIME type from the file's contents is what actually stops it.
     */
    private function assertIsReallyAnImage(UploadedFile $file): void
    {
        $mime = $file->getMimeType();

        if (! in_array($mime, self::ALLOWED_MIME, true)) {
            throw new BusinessRuleException(
                "That file is a {$mime}. Upload a JPEG, PNG, WebP, or GIF image.",
                'invalid_image_type',
                ['detected_mime' => $mime],
                422,
            );
        }

        if (@getimagesize($file->getRealPath()) === false) {
            throw new BusinessRuleException(
                'That file is not a readable image.',
                'invalid_image',
                [],
                422,
            );
        }
    }

    private function safeExtension(UploadedFile $file): string
    {
        $extension = Str::lower($file->extension() ?: 'jpg');

        return in_array($extension, self::ALLOWED_EXTENSIONS, true) ? $extension : 'jpg';
    }
}
