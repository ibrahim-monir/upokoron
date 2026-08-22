<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Enums\OrderStatus;
use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductReview;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A customer's own review of a product.
 *
 * Writing a review requires proof of purchase: the customer must have a
 * delivered order that contains this product. That is checked here, at the
 * write, rather than trusted from the request -- the same reason checkout
 * never accepts a price from the client.
 */
class ReviewController extends Controller
{
    /**
     * Public, approved reviews for a product.
     */
    public function index(Request $request, Product $product): JsonResponse
    {
        $reviews = $product->reviews()
            ->approved()
            ->with('customer:id,name')
            ->latest('id')
            ->paginate(min(max($request->integer('per_page', 10), 1), 50));

        return response()->json([
            'data' => collect($reviews->items())->map(fn (ProductReview $r) => $this->present($r))->all(),
            'meta' => [
                'current_page' => $reviews->currentPage(),
                'last_page' => $reviews->lastPage(),
                'per_page' => $reviews->perPage(),
                'total' => $reviews->total(),
            ],
        ]);
    }

    /**
     * The signed-in customer's own review of this product, if any -- so the
     * page can offer "edit" instead of a second "write a review" form.
     */
    public function mine(Request $request, Product $product): JsonResponse
    {
        $customer = $this->customer($request);

        $review = $product->reviews()->where('customer_id', $customer->id)->first();

        return response()->json([
            'data' => $review === null ? null : $this->present($review, includeStatus: true),
            'can_review' => $review === null && $this->hasDeliveredPurchase($customer, $product),
        ]);
    }

    public function store(Request $request, Product $product): JsonResponse
    {
        $customer = $this->customer($request);

        abort_if(
            $product->reviews()->where('customer_id', $customer->id)->exists(),
            409,
            'You have already reviewed this product. Edit your existing review instead.'
        );

        $orderItem = $this->deliveredOrderItem($customer, $product);

        abort_if(
            $orderItem === null,
            403,
            'You can only review products from a delivered order.'
        );

        $data = $this->validated($request);

        $review = ProductReview::create($data + [
            'product_id' => $product->id,
            'customer_id' => $customer->id,
            'order_item_id' => $orderItem->id,
            'status' => ReviewStatus::Pending->value,
        ]);

        return response()->json([
            'message' => 'Thanks for your review. It will show once approved.',
            'data' => $this->present($review, includeStatus: true),
        ], 201);
    }

    public function update(Request $request, Product $product, ProductReview $review): JsonResponse
    {
        $customer = $this->customer($request);

        abort_unless($review->product_id === $product->id && $review->customer_id === $customer->id, 404);

        $wasApproved = $review->status === ReviewStatus::Approved;

        $review->update($this->validated($request) + [
            // Edited content has not been seen by a moderator yet.
            'status' => ReviewStatus::Pending->value,
            'approved_by' => null,
            'approved_at' => null,
        ]);

        if ($wasApproved) {
            $product->refreshRatingSummary();
        }

        return response()->json([
            'message' => 'Review updated. It will show once approved again.',
            'data' => $this->present($review->refresh(), includeStatus: true),
        ]);
    }

    public function destroy(Request $request, Product $product, ProductReview $review): JsonResponse
    {
        $customer = $this->customer($request);

        abort_unless($review->product_id === $product->id && $review->customer_id === $customer->id, 404);

        $wasApproved = $review->status === ReviewStatus::Approved;

        $review->delete();

        if ($wasApproved) {
            $product->refreshRatingSummary();
        }

        return response()->json(['message' => 'Review removed.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string', 'max:150'],
            'comment' => ['required', 'string', 'max:2000'],
        ]);
    }

    private function hasDeliveredPurchase(Customer $customer, Product $product): bool
    {
        return $this->deliveredOrderItem($customer, $product) !== null;
    }

    /**
     * The most recent delivered order line for this product, which stands as
     * this customer's proof of purchase.
     */
    private function deliveredOrderItem(Customer $customer, Product $product): ?OrderItem
    {
        return OrderItem::query()
            ->whereHas('order', fn ($q) => $q->where('customer_id', $customer->id)
                ->where('status', OrderStatus::Delivered->value))
            ->whereHas('variation', fn ($q) => $q->where('product_id', $product->id))
            ->latest('id')
            ->first();
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user()?->customer;

        abort_if($customer === null, 403, 'This account cannot review products.');

        return $customer;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ProductReview $review, bool $includeStatus = false): array
    {
        return [
            'id' => $review->id,
            'rating' => $review->rating,
            'title' => $review->title,
            'comment' => $review->comment,
            'customer_name' => $review->customer?->name,
            'is_verified_purchase' => $review->isVerifiedPurchase(),
            'created_at' => $review->created_at?->toIso8601String(),
            ...($includeStatus ? [
                'status' => $review->status->value,
                'status_label' => $review->status->label(),
            ] : []),
        ];
    }
}
