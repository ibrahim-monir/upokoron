<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How many points a cart has asked to redeem.
 *
 * Consistent with the coupon column beside it: no discount amount is stored
 * here. CartService revalidates the redemption against the customer's
 * current balance and the live subtotal on every read, so a balance that
 * changed (an expiry, a manual debit) is caught before checkout rather than
 * trusted stale.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('carts', function (Blueprint $table): void {
            $table->unsignedInteger('reward_points_redeemed')->default(0)->after('coupon_id');
        });
    }

    public function down(): void
    {
        Schema::table('carts', function (Blueprint $table): void {
            $table->dropColumn('reward_points_redeemed');
        });
    }
};
