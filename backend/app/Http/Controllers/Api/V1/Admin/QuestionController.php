<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\QuestionStatus;
use App\Http\Controllers\Controller;
use App\Models\ProductQuestion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

/**
 * The shop's side of product Q&A: read what has been asked, answer it, and
 * decide what reaches the product page.
 *
 * Anyone can ask without an account, so this is the only place an answer can
 * be written -- the storefront controller has no such route. Answering also
 * approves, because a member of staff who has read a question well enough to
 * reply to it has already moderated it; making them click approve as well
 * would only produce answered questions nobody published.
 */
class QuestionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('questions.view'), 403);

        $questions = ProductQuestion::query()
            ->with(['product:id,name,slug', 'answeredBy:id,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->integer('product_id')))
            // "Show me what still needs a reply", which is the whole job.
            ->when($request->boolean('unanswered'), fn ($q) => $q->whereNull('answer'))
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%'.$request->string('search')->trim().'%';

                $query->where(fn ($q) => $q->where('question', 'like', $term)
                    ->orWhere('answer', 'like', $term)
                    ->orWhere('asker_name', 'like', $term)
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', $term)));
            })
            ->latest('id')
            ->paginate(min(max($request->integer('per_page', 20), 1), 100));

        return response()->json([
            'data' => collect($questions->items())
                ->map(fn (ProductQuestion $q): array => $this->present($q))
                ->all(),
            'meta' => [
                'current_page' => $questions->currentPage(),
                'last_page' => $questions->lastPage(),
                'per_page' => $questions->perPage(),
                'total' => $questions->total(),
            ],
            'summary' => $this->summary(),
        ]);
    }

    /**
     * Write, or rewrite, the shop's answer.
     */
    public function answer(Request $request, ProductQuestion $question): JsonResponse
    {
        abort_unless($request->user()?->can('questions.answer'), 403);

        $data = $request->validate([
            'answer' => ['required', 'string', 'max:2000'],
        ]);

        $question->forceFill([
            'answer' => $data['answer'],
            'answered_by' => Auth::id(),
            'answered_at' => now(),
            // See the class comment: replying is approving.
            'status' => QuestionStatus::Approved->value,
        ])->save();

        return response()->json([
            'message' => 'Answer published.',
            'data' => $this->present($question->refresh()->load('product', 'answeredBy')),
        ]);
    }

    /**
     * Publish or hide a question without answering it.
     */
    public function updateStatus(Request $request, ProductQuestion $question): JsonResponse
    {
        abort_unless($request->user()?->can('questions.answer'), 403);

        $data = $request->validate([
            'status' => ['required', Rule::in([QuestionStatus::Approved->value, QuestionStatus::Rejected->value])],
        ]);

        $question->forceFill(['status' => $data['status']])->save();

        return response()->json([
            'message' => $data['status'] === QuestionStatus::Approved->value
                ? 'Question published.'
                : 'Question hidden.',
            'data' => $this->present($question->refresh()->load('product', 'answeredBy')),
        ]);
    }

    public function destroy(Request $request, ProductQuestion $question): JsonResponse
    {
        abort_unless($request->user()?->can('questions.answer'), 403);

        $question->delete();

        return response()->json(['message' => 'Question removed.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ProductQuestion $question): array
    {
        return [
            'id' => $question->id,
            'asker_name' => $question->asker_name,
            'asker_email' => $question->asker_email,
            'question' => $question->question,
            'answer' => $question->answer,
            'answered_by' => $question->answeredBy?->name,
            'answered_at' => $question->answered_at?->toIso8601String(),
            'status' => $question->status->value,
            'status_label' => $question->status->label(),
            'product' => $question->product === null ? null : [
                'id' => $question->product->id,
                'name' => $question->product->name,
                'slug' => $question->product->slug,
            ],
            'created_at' => $question->created_at?->toIso8601String(),
        ];
    }

    /**
     * Counts for the filter tiles: one per status, plus the number still
     * waiting on a reply -- the tile that actually gets clicked.
     *
     * @return array<string, mixed>
     */
    private function summary(): array
    {
        $byStatus = ProductQuestion::query()
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $counts = [];

        foreach (QuestionStatus::cases() as $status) {
            $counts[$status->value] = [
                'label' => $status->label(),
                'count' => (int) ($byStatus[$status->value] ?? 0),
            ];
        }

        return [
            'by_status' => $counts,
            'unanswered' => ProductQuestion::query()->whereNull('answer')->count(),
        ];
    }
}
