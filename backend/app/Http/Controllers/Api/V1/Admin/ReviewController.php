<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Models\ProductReview;
use App\Services\Rewards\RewardPointsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

/**
 * Moderation queue for product reviews.
 *
 * A review only counts towards a product's public rating once it is
 * Approved here -- that gate is what stops a customer's own storefront
 * write from putting unmoderated text straight in front of other shoppers.
 */
class ReviewController extends Controller
{
    public function __construct(private readonly RewardPointsService $rewards) {}

    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('reviews.view'), 403);

        $reviews = ProductReview::query()
            ->with(['product:id,name,slug', 'customer:id,name,phone'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('product_id'), fn ($q) => $q->where('product_id', $request->integer('product_id')))
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%'.$request->string('search')->trim().'%';

                $query->where(fn ($q) => $q->where('comment', 'like', $term)
                    ->orWhere('title', 'like', $term)
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', $term))
                    ->orWhereHas('customer', fn ($c) => $c->where('name', 'like', $term)));
            })
            ->latest('id')
            ->paginate(min(max($request->integer('per_page', 20), 1), 100));

        return response()->json([
            'data' => collect($reviews->items())->map(fn (ProductReview $r): array => $this->present($r))->all(),
            'meta' => [
                'current_page' => $reviews->currentPage(),
                'last_page' => $reviews->lastPage(),
                'per_page' => $reviews->perPage(),
                'total' => $reviews->total(),
            ],
            'summary' => $this->summary(),
        ]);
    }

    public function updateStatus(Request $request, ProductReview $review): JsonResponse
    {
        abort_unless($request->user()?->can('reviews.moderate'), 403);

        $data = $request->validate([
            'status' => ['required', Rule::in([ReviewStatus::Approved->value, ReviewStatus::Rejected->value])],
        ]);

        $status = ReviewStatus::from($data['status']);

        $review->forceFill([
            'status' => $status->value,
            'approved_by' => $status === ReviewStatus::Approved ? Auth::id() : null,
            'approved_at' => $status === ReviewStatus::Approved ? now() : null,
        ])->save();

        $review->product->refreshRatingSummary();

        if ($status === ReviewStatus::Approved) {
            $this->rewards->awardReview($review);
        }

        return response()->json([
            'message' => $status === ReviewStatus::Approved ? 'Review approved.' : 'Review rejected.',
            'data' => $this->present($review->refresh()->load('product', 'customer')),
        ]);
    }

    public function destroy(Request $request, ProductReview $review): JsonResponse
    {
        abort_unless($request->user()?->can('reviews.moderate'), 403);

        $wasApproved = $review->status === ReviewStatus::Approved;
        $product = $review->product;

        $review->delete();

        if ($wasApproved) {
            $product->refreshRatingSummary();
        }

        return response()->json(['message' => 'Review removed.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ProductReview $review): array
    {
        return [
            'id' => $review->id,
            'rating' => $review->rating,
            'title' => $review->title,
            'comment' => $review->comment,
            'status' => $review->status->value,
            'status_label' => $review->status->label(),
            'is_verified_purchase' => $review->isVerifiedPurchase(),
            'product' => $review->product === null ? null : [
                'id' => $review->product->id,
                'name' => $review->product->name,
                'slug' => $review->product->slug,
            ],
            'customer' => $review->customer === null ? null : [
                'id' => $review->customer->id,
                'name' => $review->customer->name,
                'phone' => $review->customer->phone,
            ],
            'created_at' => $review->created_at?->toIso8601String(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function summary(): array
    {
        $byStatus = ProductReview::query()
            ->selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $counts = [];

        foreach (ReviewStatus::cases() as $status) {
            $counts[$status->value] = [
                'label' => $status->label(),
                'count' => (int) ($byStatus[$status->value] ?? 0),
            ];
        }

        return ['by_status' => $counts];
    }
}
