<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Faq;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FaqController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('faqs.manage'), 403);

        return response()->json([
            'data' => Faq::ordered()->get()->map(fn (Faq $faq) => $this->present($faq)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('faqs.manage'), 403);

        $faq = Faq::create($this->validated($request) + [
            // New questions go to the end rather than the top: the order is
            // the owner's, and inserting at the front would rearrange it.
            'position' => (int) Faq::max('position') + 1,
        ]);

        return response()->json([
            'message' => 'Question added.',
            'data' => $this->present($faq),
        ], 201);
    }

    public function update(Request $request, Faq $faq): JsonResponse
    {
        abort_unless($request->user()?->can('faqs.manage'), 403);

        $faq->update($this->validated($request));

        return response()->json([
            'message' => 'Question updated.',
            'data' => $this->present($faq->refresh()),
        ]);
    }

    public function destroy(Request $request, Faq $faq): JsonResponse
    {
        abort_unless($request->user()?->can('faqs.manage'), 403);

        $faq->delete();

        return response()->json(['message' => 'Question deleted.']);
    }

    /**
     * Save the whole running order in one write.
     *
     * Sent as a list of ids in their new order, so moving one question does
     * not turn into a request per row that can half-apply.
     */
    public function reorder(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('faqs.manage'), 403);

        $validated = $request->validate([
            'order' => ['required', 'array'],
            'order.*' => ['integer'],
        ]);

        DB::transaction(function () use ($validated): void {
            foreach ($validated['order'] as $index => $id) {
                Faq::whereKey($id)->update(['position' => $index]);
            }
        });

        return response()->json(['message' => 'Order saved.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'question' => ['required', 'string', 'max:300'],
            'answer' => ['required', 'string', 'max:5000'],
            'is_active' => ['sometimes', 'boolean'],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Faq $faq): array
    {
        return [
            'id' => $faq->id,
            'question' => $faq->question,
            'answer' => $faq->answer,
            'position' => $faq->position,
            'is_active' => $faq->is_active,
        ];
    }
}
