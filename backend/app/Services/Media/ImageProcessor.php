<?php

declare(strict_types=1);

namespace App\Services\Media;

use App\Exceptions\BusinessRuleException;
use Illuminate\Http\UploadedFile;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\ImageManager;
use Throwable;

/**
 * Resizes and re-compresses an upload before it is stored, and refuses a
 * source photo too small to ever look sharp at the sizes the storefront
 * displays it -- the product gallery alone renders around 500-600px wide on
 * an ordinary screen, more on a retina one. Nothing else in the pipeline
 * generates a second, larger derivative to fall back on, so the source has
 * to already be good enough: this is the fix for images looking blurry.
 *
 * GD is virtually universal on shared hosting but is not one of the
 * extensions this app's cPanel deploy guide promises (see docs/DEPLOY.md).
 * If a host genuinely lacks it, resizing/compression is skipped rather than
 * failing every upload -- the store still works, it just keeps whatever the
 * admin uploaded verbatim, same as before this class existed. The minimum
 * size check does not need GD at all (getimagesize() is core PHP), so it
 * still runs either way.
 */
class ImageProcessor
{
    /** Shorter edge, in pixels. Below this a card looks fine but the product gallery visibly upscales it. */
    public const MIN_DIMENSION = 600;

    /** Longer edge a stored image is capped to. Nothing on the site displays larger than this. */
    private const MAX_DIMENSION = 2000;

    private const JPEG_QUALITY = 85;

    private const WEBP_QUALITY = 85;

    /** SVG isn't raster, and a GIF may be animated -- both are stored untouched. */
    private const PROCESSABLE_MIME = ['image/jpeg', 'image/png', 'image/webp'];

    public function available(): bool
    {
        return extension_loaded('gd');
    }

    /**
     * @return array{0: int|null, 1: int|null}
     */
    public function dimensions(UploadedFile $file): array
    {
        if ($file->getMimeType() === 'image/svg+xml') {
            return [null, null];
        }

        $size = @getimagesize($file->getRealPath());

        return $size === false ? [null, null] : [$size[0], $size[1]];
    }

    /**
     * A blank width/height (SVG, or a size PHP could not read) is nothing to
     * reject here -- assertIsReallyAnImage() already confirmed the file
     * decodes, and SVG scales without ever looking pixelated in the first
     * place.
     */
    public function assertLargeEnough(?int $width, ?int $height, string $mime): void
    {
        if ($width === null || $height === null || $mime === 'image/gif') {
            return;
        }

        if (min($width, $height) < self::MIN_DIMENSION) {
            throw new BusinessRuleException(
                "That image is only {$width}\u{00D7}{$height}px. Product photos need at least ".
                self::MIN_DIMENSION.'px on the shorter side, or it will look blurry once shown at full size.',
                'image_too_small',
                ['width' => $width, 'height' => $height, 'min' => self::MIN_DIMENSION],
                422,
            );
        }
    }

    /**
     * @return array{0: string, 1: int|null, 2: int|null} [bytes to store, width, height]
     */
    public function process(UploadedFile $file, ?int $originalWidth, ?int $originalHeight): array
    {
        $mime = $file->getMimeType();
        $original = (string) file_get_contents($file->getRealPath());
        $fallback = [$original, $originalWidth, $originalHeight];

        if (! in_array($mime, self::PROCESSABLE_MIME, true) || ! $this->available()) {
            return $fallback;
        }

        try {
            $image = (new ImageManager(new Driver()))->read($original);
            $image->scaleDown(width: self::MAX_DIMENSION, height: self::MAX_DIMENSION);

            $encoded = match ($mime) {
                'image/png' => (string) $image->toPng(),
                'image/webp' => (string) $image->toWebp(self::WEBP_QUALITY),
                default => (string) $image->toJpeg(self::JPEG_QUALITY),
            };

            return [$encoded, $image->width(), $image->height()];
        } catch (Throwable) {
            // A file getimagesize() accepted but this library still choked
            // on (a truncated download, an exotic colour profile) ships as
            // originally uploaded rather than blocking the admin.
            return $fallback;
        }
    }
}
