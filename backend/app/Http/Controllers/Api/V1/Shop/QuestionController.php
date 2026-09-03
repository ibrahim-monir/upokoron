<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Enums\QuestionStatus;
use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductQuestion;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Questions shoppers ask about a product, and the shop's answers.
 *
 * No login: someone deciding whether to buy has not made an account yet, and
 * making them do so first is how a shop never hears the question at all. The
 * cost of that openness is paid on the way out rather than the way in --
 * nothing posted here is public until staff approve it, and the route is
 * rate limited like the contact form.
 *
 * Answering is not here at all. Only staff answer, from the admin panel.
 */
class QuestionController extends Controller
{
    /**
     * Approved questions for a product, public.
     *
     * Answered ones first: they are the ones that help the next shopper.
     * Within each group, newest first.
     */
    public function index(Request $request, Product $product): JsonResponse
    {
        $questions = $product->questions()
            ->approved()
            ->orderByRaw('answered_at IS NULL')
            ->latest('id')
            ->paginate(min(max($request->integer('per_page', 10), 1), 50));

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
        ]);
    }

    public function store(Request $request, Product $product): JsonResponse
    {
        $customer = $request->user()?->customer;

        $data = $request->validate([
            // Required of guests; prefilled from the account when there is
            // one, so a signed-in shopper never retypes their own name.
            'asker_name' => [$customer === null ? 'required' : 'nullable', 'string', 'max:120'],
            'asker_email' => ['nullable', 'email:rfc', 'max:190'],
            'question' => ['required', 'string', 'min:5', 'max:1000'],
        ]);

        $question = ProductQuestion::create([
            'product_id' => $product->id,
            'customer_id' => $customer?->id,
            'asker_name' => ($data['asker_name'] ?? null) ?: ($customer?->name ?? 'Customer'),
            'asker_email' => ($data['asker_email'] ?? null) ?: $customer?->email,
            'question' => $data['question'],
            'status' => QuestionStatus::Pending->value,
            'ip_address' => $request->ip(),
        ]);

        return response()->json([
            'message' => 'Thanks for asking. Your question will show here once we have answered it.',
            'data' => $this->present($question),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ProductQuestion $question): array
    {
        return [
            'id' => $question->id,
            'asker_name' => $question->asker_name,
            'question' => $question->question,
            'answer' => $question->answer,
            'answered_at' => $question->answered_at?->toIso8601String(),
            'created_at' => $question->created_at?->toIso8601String(),
        ];
    }
}
