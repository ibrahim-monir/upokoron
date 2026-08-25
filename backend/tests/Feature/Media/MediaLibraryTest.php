<?php

declare(strict_types=1);

namespace Tests\Feature\Media;

use App\Models\Category;
use App\Models\Media;
use App\Services\Media\MediaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MediaLibraryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake(MediaService::DISK);
    }

    private function image(string $name = 'photo.jpg', int $width = 400, int $height = 300): UploadedFile
    {
        return UploadedFile::fake()->image($name, $width, $height);
    }

    public function test_an_admin_can_upload_an_image(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', [
            'files' => [$this->image()],
            'folder' => 'branding',
        ])->assertCreated()->assertJsonPath('data.0.folder', 'branding');

        $media = Media::sole();

        $this->assertSame(400, $media->width);
        $this->assertSame(300, $media->height);
        Storage::disk(MediaService::DISK)->assertExists($media->path);
    }

    public function test_several_images_upload_at_once(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', [
            'files' => [$this->image('a.jpg'), $this->image('b.jpg', 500, 500)],
        ])->assertCreated()->assertJsonCount(2, 'data');

        $this->assertSame(2, Media::count());
    }

    /**
     * The stored name is generated, never the client's. An attacker-supplied
     * filename has no business reaching the filesystem.
     */
    public function test_the_uploaded_filename_is_never_used_as_the_path(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', [
            'files' => [$this->image('../../evil shell.jpg')],
        ])->assertCreated();

        $media = Media::sole();

        $this->assertStringNotContainsString('..', $media->path);
        $this->assertStringNotContainsString('evil', $media->path);
        $this->assertStringContainsString('evil', $media->original_name);
    }

    /**
     * The same picture uploaded twice is one image. Without this the library
     * fills with near-identical thumbnails nobody can tell apart.
     */
    public function test_re_uploading_the_same_file_returns_the_existing_entry(): void
    {
        $this->actingAsRole('owner');
        $service = app(MediaService::class);

        /*
         * The fake file must be held in a variable. Calling getRealPath() on
         * the temporary directly lets it be destroyed straight away, and its
         * destructor deletes the file out from under the read.
         */
        $source = UploadedFile::fake()->image('same.jpg', 200, 200);
        $bytes = file_get_contents($source->getRealPath());

        $first = $service->upload($this->fileFrom($bytes, 'one.jpg'));
        $second = $service->upload($this->fileFrom($bytes, 'two.jpg'));

        $this->assertSame($first->id, $second->id);
        $this->assertSame(1, Media::count());
    }

    /**
     * An extension check is not a type check: this file is named .jpg and is
     * actually PHP.
     */
    public function test_a_script_renamed_as_an_image_is_refused(): void
    {
        $this->actingAsRole('owner');

        $fake = UploadedFile::fake()->createWithContent('payload.jpg', '<?php echo "pwned";');

        $this->postJson('/api/v1/admin/media', ['files' => [$fake]])
            ->assertStatus(422);

        $this->assertSame(0, Media::count());
    }

    public function test_an_oversized_image_is_refused(): void
    {
        $this->actingAsRole('owner');

        $big = UploadedFile::fake()->create('huge.jpg', 6 * 1024, 'image/jpeg');

        $this->postJson('/api/v1/admin/media', ['files' => [$big]])
            ->assertStatus(422)
            ->assertJsonValidationErrors('files.0');
    }

    /**
     * Product photos are shown much larger on the product page than on a
     * card, and nothing generates a second, bigger derivative to fall back
     * on -- so a source image too small to fill that larger box would come
     * out visibly upscaled and blurry. Caught here instead.
     */
    public function test_a_low_resolution_product_image_is_refused(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', [
            'files' => [$this->image('small.jpg', 400, 400)],
            'folder' => 'products',
        ])->assertStatus(422)->assertJsonPath('code', 'image_too_small');

        $this->assertSame(0, Media::count());
    }

    /**
     * The same small image is perfectly fine as a logo or a favicon -- the
     * minimum-resolution rule only makes sense for product photography.
     */
    public function test_a_low_resolution_image_is_accepted_outside_the_products_folder(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', [
            'files' => [$this->image('logo.jpg', 200, 200)],
            'folder' => 'branding',
        ])->assertCreated();

        $this->assertSame(1, Media::count());
    }

    /**
     * Nothing on the site displays a product photo larger than this, so a
     * bigger source is downscaled on the way in rather than stored (and
     * served) at its full original size for no benefit.
     */
    public function test_an_oversized_product_image_is_downscaled(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', [
            'files' => [$this->image('huge.jpg', 2200, 1760)],
            'folder' => 'products',
        ])->assertCreated();

        $media = Media::sole();

        $this->assertLessThanOrEqual(2000, $media->width);
        $this->assertLessThanOrEqual(2000, $media->height);
        // Aspect ratio survives the resize.
        $this->assertEqualsWithDelta(2200 / 1760, $media->width / $media->height, 0.01);
    }

    public function test_a_folder_name_cannot_escape_the_uploads_directory(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', [
            'files' => [$this->image()],
            'folder' => '../../etc',
        ])->assertStatus(422)->assertJsonValidationErrors('folder');
    }

    // ─── Deletion ────────────────────────────────────────────────────────

    public function test_an_unused_image_can_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', ['files' => [$this->image()]])->assertCreated();

        $media = Media::sole();

        $this->deleteJson("/api/v1/admin/media/{$media->id}")->assertOk();

        $this->assertSame(0, Media::count());
        Storage::disk(MediaService::DISK)->assertMissing($media->path);
    }

    /**
     * Deleting an image a live product still points at leaves a broken
     * picture on the storefront, which the owner notices after a customer.
     */
    public function test_an_image_in_use_cannot_be_deleted(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', ['files' => [$this->image()]])->assertCreated();

        $media = Media::sole();

        Category::factory()->create(['image' => $media->url()]);

        $this->deleteJson("/api/v1/admin/media/{$media->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'media_in_use');

        $this->assertSame(1, Media::count());
        Storage::disk(MediaService::DISK)->assertExists($media->path);
    }

    // ─── Permissions ─────────────────────────────────────────────────────

    public function test_support_can_browse_but_not_upload(): void
    {
        $this->actingAsRole('support');

        $this->getJson('/api/v1/admin/media')->assertOk();

        $this->postJson('/api/v1/admin/media', ['files' => [$this->image()]])->assertForbidden();
    }

    public function test_an_accountant_cannot_reach_the_library(): void
    {
        $this->actingAsRole('accountant');

        $this->getJson('/api/v1/admin/media')->assertForbidden();
    }

    public function test_a_stock_manager_can_upload(): void
    {
        $this->actingAsRole('stock_manager');

        $this->postJson('/api/v1/admin/media', ['files' => [$this->image()]])->assertCreated();
    }

    public function test_the_library_can_be_searched(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', ['files' => [$this->image('blue-logo.jpg')]])->assertCreated();
        $this->postJson('/api/v1/admin/media', ['files' => [$this->image('red-banner.jpg', 800, 200)]])->assertCreated();

        $this->getJson('/api/v1/admin/media?search=logo')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.original_name', 'blue-logo.jpg');
    }

    public function test_alt_text_can_be_edited(): void
    {
        $this->actingAsRole('owner');

        $this->postJson('/api/v1/admin/media', ['files' => [$this->image()]])->assertCreated();

        $media = Media::sole();

        $this->putJson("/api/v1/admin/media/{$media->id}", ['alt' => 'Company logo'])
            ->assertOk()
            ->assertJsonPath('data.alt', 'Company logo');
    }

    private function fileFrom(string $bytes, string $name): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'media');
        file_put_contents($path, $bytes);

        return new UploadedFile($path, $name, 'image/jpeg', null, true);
    }
}
