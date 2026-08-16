<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The coupon an order used, frozen the way everything else on an order is.
 *
 * Not a join to `coupons` for the discount amount: `coupon_code` and
 * `coupon_discount` are copies, so a coupon edited or deleted after the sale
 * does not rewrite what this invoice says was applied. `coupon_id` is kept
 * alongside for reporting only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->foreignId('coupon_id')->nullable()->after('shipping_rate_id')
                ->constrained('coupons')->nullOnDelete();
            $table->string('coupon_code', 40)->nullable()->after('coupon_id');
            $table->decimal('coupon_discount', 15, 2)->default(0)->after('discount_total');
        });

        DB::statement('
            ALTER TABLE orders
            ADD CONSTRAINT chk_orders_coupon_discount_non_negative
            CHECK (coupon_discount >= 0)
        ');
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('coupon_id');
            $table->dropColumn(['coupon_code', 'coupon_discount']);
        });
    }
};
