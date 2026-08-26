<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\OrderStatus;
use App\Enums\ReviewStatus;
use App\Http\Controllers\Controller;
use App\Models\Banner;
use App\Models\Brand;
use App\Models\Category;
use App\Models\ContactMessage;
use App\Models\Coupon;
use App\Models\Customer;
use App\Models\Faq;
use App\Models\Inventory;
use App\Models\Media;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductReview;
use App\Models\User;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Everything the dashboard shows, in one request.
 *
 * The one decision that matters here: **sales means DELIVERED**.
 *
 * It would be easy, and flattering, to count every order the moment it is
 * placed. On cash on delivery that overstates the business by every parcel
 * still on a courier's motorbike, and a meaningful share of those come back.
 * The dashboard therefore reports what the ledger reports, and shows orders
 * in flight separately, as a pipeline rather than as income.
 */
class DashboardController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('dashboard.view'), 403);

        $timezone = config('upokoron.display_timezone');
        $today = Carbon::now($timezone)->startOfDay();
        $monthStart = Carbon::now($timezone)->startOfMonth();

        return response()->json([
            'data' => [
                'today' => $this->window($today, Carbon::now($timezone)),
                'month' => $this->window($monthStart, Carbon::now($timezone)),
                'pipeline' => $this->pipeline(),
                'stock' => $request->user()->can('inventory.view') ? $this->stock() : null,
                'trend' => $this->trend($timezone),
                'recent' => $this->recentOrders(),
                'site' => $this->site($request->user()),
            ],
        ]);
    }

    /**
     * The rest of the shop, counted.
     *
     * Everything above this is money moving. This is the standing state of
     * the site -- how much catalogue there is, how much of it is live, and
     * what is sitting unanswered -- because none of it reached the dashboard
     * before and some of it is work waiting.
     *
     * Each entry is null when the viewer cannot see that area. Gating it in
     * the frontend would still have sent the number, and a count is
     * information: how many customers a shop has is not something a
     * warehouse login should learn from a tile it cannot click.
     *
     * 'total' is always what that area's own screen opens on, never a
     * filtered slice presented as the whole -- the same rule the order tiles
     * follow, so a number can be clicked without it changing. 'live' is the
     * part worth acting on.
     *
     * @return array<string, array<string, int>|null>
     */
    private function site(User $user): array
    {
        $now = Carbon::now(config('upokoron.display_timezone'));

        return [
            'products' => $user->can('products.view') ? [
                'total' => Product::count(),
                // The scope, not a status check: a product can be Active and
                // still not on the storefront because its publish date has
                // not arrived. 'Live' has to mean what a shopper can see.
                'live' => Product::published()->count(),
            ] : null,

            'categories' => $user->can('categories.manage') ? [
                'total' => Category::count(),
                'live' => Category::where('is_active', true)->count(),
            ] : null,

            'brands' => $user->can('brands.manage') ? [
                'total' => Brand::count(),
                'live' => Brand::where('is_active', true)->count(),
            ] : null,

            'customers' => $user->can('customers.view') ? [
                'total' => Customer::count(),
                'live' => Customer::where('created_at', '>=', $now->copy()->startOfMonth()->utc())->count(),
            ] : null,

            'reviews' => $user->can('reviews.view') ? [
                'total' => ProductReview::count(),
                'live' => ProductReview::where('status', ReviewStatus::Pending->value)->count(),
            ] : null,

            'messages' => $user->can('contact.view') ? [
                'total' => ContactMessage::count(),
                'live' => ContactMessage::unread()->count(),
            ] : null,

            'faqs' => $user->can('faqs.manage') ? [
                'total' => Faq::count(),
                'live' => Faq::where('is_active', true)->count(),
            ] : null,

            // Switched on AND inside its dates. A coupon whose window shut
            // last week is still is_active in the table, and counting that as
            // running is how a shop comes to believe it has an offer live
            // that no checkout will accept.
            'coupons' => $user->can('coupons.manage') ? [
                'total' => Coupon::count(),
                'live' => Coupon::where('is_active', true)
                    ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now->utc()))
                    ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>=', $now->utc()))
                    ->count(),
            ] : null,

            'banners' => $user->can('banners.manage') ? [
                'total' => Banner::count(),
                'live' => Banner::where('is_active', true)->count(),
            ] : null,

            // 'live' carries bytes rather than a count here: what a media
            // library is running out of is disk, not files.
            'media' => $user->can('media.view') ? [
                'total' => Media::count(),
                'live' => (int) Media::sum('size'),
            ] : null,

            // The users screen lists everyone with a login, shoppers
            // included, so that is what the total counts. The ones holding a
            // role are the staff.
            'staff' => $user->can('users.view') ? [
                'total' => User::count(),
                'live' => User::whereHas('roles')->count(),
            ] : null,

            // Points customers are holding: what the shop owes in discounts
            // if every balance were spent tomorrow. A liability, so it is
            // worth a number of its own.
            'rewards' => $user->can('rewards.view') ? [
                'total' => (int) Customer::sum('reward_points_balance'),
                'live' => Customer::where('reward_points_balance', '>', 0)->count(),
            ] : null,
        ];
    }

    /**
     * Delivered sales in a period, with the cost that came with them.
     *
     * @return array<string, mixed>
     */
    private function window(Carbon $from, Carbon $to): array
    {
        $row = Order::query()
            ->where('status', OrderStatus::Delivered->value)
            ->whereBetween('delivered_at', [$from->utc(), $to->utc()])
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(subtotal), 0) as revenue')
            ->selectRaw('COALESCE(SUM(cost_total), 0) as cost')
            ->selectRaw('COALESCE(SUM(shipping_charge), 0) as delivery')
            ->first();

        $revenue = Money::of((string) ($row->revenue ?? '0'));
        $cost = Money::of((string) ($row->cost ?? '0'));

        return [
            'orders' => (int) ($row->orders ?? 0),
            'revenue' => $revenue->value(),
            'cost' => $cost->value(),
            'gross_profit' => $revenue->minus($cost)->value(),
            'delivery_income' => Money::of((string) ($row->delivery ?? '0'))->value(),
        ];
    }

    /**
     * Orders that need someone to do something.
     *
     * Counts AND value: "6 orders to confirm" and "৳48,000 to confirm" are
     * different facts, and the second is what decides the order of the day.
     *
     * @return array<string, mixed>
     */
    private function pipeline(): array
    {
        $stages = OrderStatus::inFlight();

        $rows = Order::query()
            ->open()
            ->selectRaw('status, COUNT(*) as orders, COALESCE(SUM(total), 0) as value')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $breakdown = [];
        $totalOrders = 0;
        $totalValue = Money::zero();

        foreach ($stages as $status) {
            $row = $rows->get($status->value);
            $value = Money::of((string) ($row->value ?? '0'));

            $breakdown[] = [
                'status' => $status->value,
                'label' => $status->label(),
                'orders' => (int) ($row->orders ?? 0),
                'value' => $value->value(),
            ];

            $totalOrders += (int) ($row->orders ?? 0);
            $totalValue = $totalValue->plus($value);
        }

        return [
            'stages' => $breakdown,
            'orders' => $totalOrders,
            'value' => $totalValue->value(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function stock(): array
    {
        $row = Inventory::query()
            ->selectRaw('COUNT(*) as tracked')
            ->selectRaw('COALESCE(SUM(stock_value), 0) as value')
            ->selectRaw('SUM(CASE WHEN available_quantity <= 0 THEN 1 ELSE 0 END) as out_of_stock')
            ->selectRaw('SUM(CASE WHEN reorder_level > 0 AND quantity <= reorder_level THEN 1 ELSE 0 END) as low_stock')
            ->first();

        return [
            'tracked' => (int) ($row->tracked ?? 0),
            'value' => Money::of((string) ($row->value ?? '0'))->value(),
            'out_of_stock' => (int) ($row->out_of_stock ?? 0),
            'low_stock' => (int) ($row->low_stock ?? 0),
        ];
    }

    /**
     * Fourteen days of delivered sales.
     *
     * Every day is present, including the ones with no sales. A trend built
     * only from days that had a sale silently closes the gaps and draws a
     * flattering line through a quiet week.
     *
     * @return array<int, array<string, mixed>>
     */
    private function trend(string $timezone): array
    {
        $days = 14;
        $start = Carbon::now($timezone)->startOfDay()->subDays($days - 1);

        /*
         * Grouped in the shop's own timezone, not the server's. Timestamps
         * are stored in UTC, so a sale at 1am in Dhaka is the previous day in
         * UTC -- grouping on the raw column would put it in the wrong bar and
         * make every daily figure quietly wrong.
         */
        $offset = Carbon::now($timezone)->format('P');

        $rows = Order::query()
            ->where('status', OrderStatus::Delivered->value)
            ->where('delivered_at', '>=', $start->copy()->utc())
            ->selectRaw("DATE(CONVERT_TZ(delivered_at, '+00:00', ?)) as day", [$offset])
            ->selectRaw('COUNT(*) as orders')
            ->selectRaw('COALESCE(SUM(subtotal), 0) as revenue')
            ->groupBy('day')
            ->get()
            ->keyBy('day');

        $series = [];

        for ($i = 0; $i < $days; $i++) {
            $date = $start->copy()->addDays($i);
            $key = $date->toDateString();
            $row = $rows->get($key);

            $series[] = [
                'date' => $key,
                'label' => $date->format('j M'),
                'orders' => (int) ($row->orders ?? 0),
                'revenue' => Money::of((string) ($row->revenue ?? '0'))->value(),
            ];
        }

        return $series;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function recentOrders(): array
    {
        return Order::query()
            ->with('customer:id,name')
            ->latest('id')
            ->limit(6)
            ->get()
            ->map(fn (Order $order): array => [
                'id' => $order->id,
                'number' => $order->number,
                'customer' => $order->customer?->name ?? $order->ship_name,
                'district' => $order->ship_district,
                'total' => $order->total,
                'status' => $order->status->value,
                'status_label' => $order->status->label(),
                'placed_at' => $order->placed_at?->toIso8601String(),
            ])
            ->all();
    }
}
