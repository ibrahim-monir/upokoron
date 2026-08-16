<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Banner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BannerController extends Controller
{
    /** Every theme key a banner may be saved with -- see BannerCarousel on the frontend for what each renders as. */
    private const THEMES = ['brand', 'navy', 'contrast'];

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('banners.manage'), 403);

        $banners = Banner::query()->orderBy('position')->orderBy('id')->get();

        return response()->json(['data' => $banners]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('banners.manage'), 403);

        $data = $this->validated($request);
        $data['position'] ??= (int) (Banner::max('position') ?? 0) + 1;

        $banner = Banner::create($data);

        return response()->json(['message' => 'Banner created.', 'banner' => $banner], 201);
    }

    public function update(Request $request, Banner $banner): JsonResponse
    {
        abort_unless($request->user()?->can('banners.manage'), 403);

        $banner->update($this->validated($request));

        return response()->json(['message' => 'Banner updated.', 'banner' => $banner->fresh()]);
    }

    public function destroy(Request $request, Banner $banner): JsonResponse
    {
        abort_unless($request->user()?->can('banners.manage'), 403);

        $banner->delete();

        return response()->json(['message' => 'Banner deleted.']);
    }

    /**
     * Sets the display order in one call, so drag-and-drop on the admin
     * screen writes a single request instead of one PUT per row.
     */
    public function reorder(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('banners.manage'), 403);

        $validated = $request->validate([
            'order' => ['required', 'array', 'min:1'],
            'order.*' => ['required', 'integer', Rule::exists('banners', 'id')],
        ]);

        foreach ($validated['order'] as $index => $id) {
            Banner::whereKey($id)->update(['position' => $index]);
        }

        return response()->json(['message' => 'Order saved.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'eyebrow' => ['nullable', 'string', 'max:60'],
            'title' => ['required', 'string', 'max:120'],
            'body' => ['nullable', 'string', 'max:200'],
            'cta_label' => ['sometimes', 'string', 'max:40'],
            'link' => ['sometimes', 'string', 'max:255', 'starts_with:/'],
            'theme' => ['sometimes', Rule::in(self::THEMES)],
            'image' => ['nullable', 'string', 'max:255'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:65535'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }
}
