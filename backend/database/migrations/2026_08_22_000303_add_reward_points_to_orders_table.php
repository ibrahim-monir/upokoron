<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * How many points this order redeemed, and what that was worth -- frozen the
 * way the coupon columns beside it are. The redemption rate can change
 * tomorrow without rewriting what this invoice already charged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->unsignedInteger('reward_points_used')->default(0)->after('coupon_discount');
            $table->decimal('reward_points_discount', 15, 2)->default(0)->after('reward_points_used');
        });

        DB::statement('
            ALTER TABLE orders
            ADD CONSTRAINT chk_orders_reward_points_discount_non_negative
            CHECK (reward_points_discount >= 0)
        ');
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropColumn(['reward_points_used', 'reward_points_discount']);
        });
    }
};
