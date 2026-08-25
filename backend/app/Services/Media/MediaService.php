<?php

declare(strict_types=1);

namespace App\Services\Media;

use App\Exceptions\BusinessRuleException;
use App\Models\Media;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * The image library.
 *
 * Files land on the `uploads` disk, which is rooted inside the served public
 * directory. That is deliberate: most cPanel hosts disable symlink(), so
 * `php artisan storage:link` fails and every image 404s with nothing in the
 * logs to explain it.
 */
class MediaService
{
    public const DISK = 'uploads';

    /** Bytes. Anything larger is a photo nobody resized. */
    public const MAX_SIZE = 5 * 1024 * 1024;

    /** @var array<int, string> */
    public const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];

    /** @var array<int, string> */
    private const EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'];

    public function __construct(private readonly ImageProcessor $processor) {}

    /**
     * Store an upload, or return the existing row if this exact file is
     * already in the library.
     */
    public function upload(UploadedFile $file, string $folder = 'general', ?string $alt = null): Media
    {
        $this->assertIsReallyAnImage($file);

        // Content hash of the ORIGINAL bytes, not the re-encoded ones -- it
        // is purely a "have I seen this exact upload before" key, and hashing
        // pre-processing keeps that answer stable even if a quality setting
        // here changes later.
        $hash = hash_file('sha256', $file->getRealPath());

        if ($existing = Media::firstWhere('hash', $hash)) {
            return $existing;
        }

        [$originalWidth, $originalHeight] = $this->processor->dimensions($file);

        // Only product photos get the minimum-resolution gate: a store logo
        // or favicon is legitimately small, and rejecting those would just
        // be wrong. Product images always run through here with folder
        // 'products' (see ProductImages.jsx's "Upload new").
        if ($folder === 'products') {
            $this->processor->assertLargeEnough($originalWidth, $originalHeight, $file->getMimeType());
        }

        [$bytes, $width, $height] = $this->processor->process($file, $originalWidth, $originalHeight);

        $extension = $this->safeExtension($file);
        $name = Str::uuid()->toString().'.'.$extension;
        $directory = trim($folder, '/') ?: 'general';
        $path = "{$directory}/{$name}";

        // Generated name, never the client's -- an attacker-supplied filename
        // has no business reaching the filesystem.
        Storage::disk(self::DISK)->put($path, $bytes);

        try {
            return Media::forceCreate([
                'disk' => self::DISK,
                'path' => $path,
                'filename' => $name,
                'original_name' => Str::limit($file->getClientOriginalName(), 190, ''),
                'mime' => $file->getMimeType(),
                'size' => strlen($bytes),
                'width' => $width,
                'height' => $height,
                'hash' => $hash,
                'alt' => $alt,
                'folder' => $directory,
                'uploaded_by' => Auth::id(),
            ]);
        } catch (UniqueConstraintViolationException) {
            // Lost a race with a concurrent identical upload. The winner's row
            // is the right answer, and this copy of the file is redundant.
            Storage::disk(self::DISK)->delete($path);

            return Media::where('hash', $hash)->firstOrFail();
        }
    }

    /**
     * @param  array<int, UploadedFile>  $files
     * @return array<int, Media>
     */
    public function uploadMany(array $files, string $folder = 'general'): array
    {
        return DB::transaction(fn () => array_map(fn (UploadedFile $file) => $this->upload($file, $folder), $files));
    }

    /**
     * Remove a file, refusing while anything still points at it.
     *
     * Deleting an image out from under a live product leaves a broken picture
     * on the storefront, which the owner will not notice until a customer
     * does.
     */
    public function delete(Media $media): void
    {
        $usage = $this->usage($media);

        if ($usage !== []) {
            throw new BusinessRuleException(
                'That image is still in use by '.implode(', ', $usage).'. Replace it there first.',
                'media_in_use',
                ['usage' => $usage],
            );
        }

        Storage::disk($media->disk)->delete($media->path);

        $media->delete();
    }

    /**
     * Everywhere this image is referenced, described for a human.
     *
     * @return array<int, string>
     */
    public function usage(Media $media): array
    {
        $url = $media->url();
        $path = $media->path;
        $usage = [];

        $products = DB::table('product_images')
            ->where('path', $path)
            ->orWhere('path', $url)
            ->count();

        if ($products > 0) {
            $usage[] = "{$products} product image(s)";
        }

        $categories = DB::table('categories')->whereIn('image', [$path, $url])->count();

        if ($categories > 0) {
            $usage[] = "{$categories} category/categories";
        }

        $brands = DB::table('brands')->whereIn('logo', [$path, $url])->count();

        if ($brands > 0) {
            $usage[] = "{$brands} brand(s)";
        }

        $settings = DB::table('settings')->whereIn('value', [$path, $url])->count();

        if ($settings > 0) {
            $usage[] = 'store settings';
        }

        return $usage;
    }

    /**
     * An extension check is not a type check: a PHP script renamed to .jpg
     * passes it. Reading the real MIME from the file's own bytes is what
     * actually stops it.
     */
    private function assertIsReallyAnImage(UploadedFile $file): void
    {
        if (! $file->isValid()) {
            throw new BusinessRuleException(
                'That upload did not arrive intact. Try again.',
                'upload_failed',
                [],
                422,
            );
        }

        if ($file->getSize() > self::MAX_SIZE) {
            throw new BusinessRuleException(
                'Images must be 5 MB or smaller. Resize it and try again.',
                'file_too_large',
                ['size' => $file->getSize(), 'max' => self::MAX_SIZE],
                422,
            );
        }

        $mime = $file->getMimeType();

        if (! in_array($mime, self::ALLOWED_MIME, true)) {
            throw new BusinessRuleException(
                "That file is a {$mime}. Upload a JPEG, PNG, WebP, GIF, or SVG.",
                'invalid_image_type',
                ['detected_mime' => $mime],
                422,
            );
        }

        // SVG is markup, so it cannot be validated by getimagesize and can
        // carry scripts. It is accepted because logos need it, and served
        // from a path the user does not control.
        if ($mime !== 'image/svg+xml' && @getimagesize($file->getRealPath()) === false) {
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
        $extension = Str::lower($file->extension() ?: '');

        if (in_array($extension, self::EXTENSIONS, true)) {
            return $extension;
        }

        return match ($file->getMimeType()) {
            'image/png' => 'png',
            'image/webp' => 'webp',
            'image/gif' => 'gif',
            'image/svg+xml' => 'svg',
            default => 'jpg',
        };
    }
}
