<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\RewardPointTransaction;
use App\Services\Rewards\RewardPointsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The signed-in customer's own loyalty point history.
 *
 * Scoped to the caller's own customer record throughout -- a transaction id
 * is a guessable integer, and there is no reason a shopper's points history
 * should be reachable through anyone else's.
 */
class RewardController extends Controller
{
    public function __construct(private readonly RewardPointsService $rewards) {}

    public function history(Request $request): JsonResponse
    {
        $customer = $this->customer($request);

        $transactions = $customer->rewardPointTransactions()
            ->with('order:id,number')
            ->latest('id')
            ->paginate(min(max($request->integer('per_page', 20), 1), 50));

        return response()->json([
            'data' => collect($transactions->items())->map(fn (RewardPointTransaction $t): array => [
                'id' => $t->id,
                'type' => $t->type->value,
                'type_label' => $t->type->label(),
                'points' => $t->points,
                'note' => $t->note,
                'order_number' => $t->order?->number,
                // Only an earn row that still holds points can expire.
                // A lot spent down to nothing keeps its old expires_at, and
                // showing that date would be telling a shopper that points
                // they no longer have are about to run out.
                'remaining_points' => (int) $t->remaining_points,
                'expires_at' => $t->remaining_points > 0 ? $t->expires_at?->toIso8601String() : null,
                'created_at' => $t->created_at?->toIso8601String(),
            ])->all(),
            'meta' => [
                'current_page' => $transactions->currentPage(),
                'last_page' => $transactions->lastPage(),
                'per_page' => $transactions->perPage(),
                'total' => $transactions->total(),
            ],
            'balance' => $this->rewards->balance($customer),

            // The one date that matters more than the whole history: what
            // goes first, and when. Points expire oldest lot first, so this
            // is the front of the queue.
            'expiring_next' => $this->expiringNext($customer),
        ]);
    }

    /**
     * @return array{points: int, at: string}|null
     */
    private function expiringNext(Customer $customer): ?array
    {
        $lot = $customer->rewardPointTransactions()
            ->where('remaining_points', '>', 0)
            ->whereNotNull('expires_at')
            ->orderBy('expires_at')
            ->first();

        if ($lot === null) {
            return null;
        }

        return [
            'points' => (int) $lot->remaining_points,
            'at' => $lot->expires_at->toIso8601String(),
        ];
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user()?->customer;

        abort_if($customer === null, 403, 'This account has no reward points.');

        return $customer;
    }
}
