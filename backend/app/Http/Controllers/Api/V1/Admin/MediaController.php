<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Services\Media\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MediaController extends Controller
{
    public function __construct(private readonly MediaService $media) {}

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('media.view'), 403);

        $items = Media::query()
            ->with('uploader:id,name')
            ->search($request->string('search')->value())
            ->when($request->filled('folder'), fn ($q) => $q->where('folder', $request->string('folder')->value()))
            ->latest('id')
            ->paginate($request->integer('per_page', 40));

        return response()->json([
            'data' => collect($items->items())->map(fn (Media $item) => $this->present($item)),
            'meta' => [
                'current_page' => $items->currentPage(),
                'last_page' => $items->lastPage(),
                'per_page' => $items->perPage(),
                'total' => $items->total(),
            ],
            'folders' => Media::query()->distinct()->orderBy('folder')->pluck('folder'),
        ]);
    }

    /**
     * Upload one or more images.
     *
     * Identical files are de-duplicated by content hash, so re-uploading a
     * picture returns the existing library entry rather than a second copy.
     */
    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('media.manage'), 403);

        $request->validate([
            'files' => ['required', 'array', 'min:1', 'max:20'],
            'files.*' => ['file', 'max:5120'],
            'folder' => ['nullable', 'string', 'max:60', 'regex:/^[a-z0-9_-]+$/'],
            'alt' => ['nullable', 'string', 'max:200'],
        ], [
            'files.*.max' => 'Each image must be 5 MB or smaller.',
            'folder.regex' => 'Use lowercase letters, numbers, dashes, and underscores only.',
        ]);

        $folder = $request->string('folder')->value() ?: 'general';

        $uploaded = array_map(
            fn ($file) => $this->media->upload($file, $folder, $request->input('alt')),
            $request->file('files'),
        );

        return response()->json([
            'message' => count($uploaded) === 1
                ? 'Image uploaded.'
                : count($uploaded).' images uploaded.',
            'data' => array_map(fn (Media $item) => $this->present($item), $uploaded),
        ], 201);
    }

    public function update(Request $request, Media $medium): JsonResponse
    {
        abort_unless($request->user()?->can('media.manage'), 403);

        $validated = $request->validate([
            'alt' => ['nullable', 'string', 'max:200'],
            'folder' => ['sometimes', 'string', 'max:60', 'regex:/^[a-z0-9_-]+$/'],
        ]);

        $medium->update($validated);

        return response()->json([
            'message' => 'Image updated.',
            'data' => $this->present($medium->fresh()),
        ]);
    }

    public function destroy(Request $request, Media $medium): JsonResponse
    {
        abort_unless($request->user()?->can('media.manage'), 403);

        // Throws a 409 listing where it is still referenced.
        $this->media->delete($medium);

        return response()->json(['message' => 'Image deleted.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Media $item): array
    {
        return [
            'id' => $item->id,
            'url' => $item->url(),
            'path' => $item->path,
            'original_name' => $item->original_name,
            'alt' => $item->alt,
            'folder' => $item->folder,
            'mime' => $item->mime,
            'size' => $item->size,
            'size_label' => $item->readableSize(),
            'width' => $item->width,
            'height' => $item->height,
            'uploaded_by' => $item->uploader?->name,
            'created_at' => $item->created_at?->toIso8601String(),
        ];
    }
}
