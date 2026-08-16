<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A cart remembers which coupon was requested, never what it was worth.
 *
 * Consistent with the rest of the cart: no money lives here. CartService
 * revalidates the coupon and recomputes its discount from the current basket
 * on every read, so a coupon that stops qualifying (an item removed, the
 * code expired while the tab sat open) is caught the moment the cart is next
 * looked at rather than trusted stale at checkout.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('carts', function (Blueprint $table): void {
            $table->foreignId('coupon_id')->nullable()->after('customer_id')
                ->constrained('coupons')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('carts', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('coupon_id');
        });
    }
};
