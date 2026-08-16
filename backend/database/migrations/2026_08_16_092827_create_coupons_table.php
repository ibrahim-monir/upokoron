<?php

declare(strict_types=1);

use App\Enums\CouponType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Discount codes.
 *
 * A coupon is looked up by its code and validated fresh on every cart read --
 * nothing about "is this still good" is cached anywhere. `used_count` is the
 * one piece of state that persists, incremented only when an order is
 * actually placed, never when a coupon is merely applied to a cart. Applying
 * one and abandoning the basket must not burn a redemption nobody used.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coupons', function (Blueprint $table): void {
            $table->id();

            // Matched case-insensitively at lookup time; stored as typed so
            // the admin screen shows it back exactly as given.
            $table->string('code', 40)->unique();
            $table->string('name')->nullable();

            $table->enum('type', array_column(CouponType::cases(), 'value'));

            // Percentage (0-100) or a fixed BDT amount, depending on type.
            $table->decimal('value', 15, 2);

            // Caps a percentage discount so "50% off" on a large order does
            // not become a bigger giveaway than intended.
            $table->decimal('max_discount_amount', 15, 2)->nullable();

            $table->decimal('min_order_total', 15, 2)->nullable();

            // Null means unlimited.
            $table->unsignedInteger('usage_limit')->nullable();
            $table->unsignedInteger('usage_limit_per_customer')->nullable();
            $table->unsignedInteger('used_count')->default(0);

            // Restricts the coupon to one customer group -- a wholesale-only
            // code, for instance. Null means everyone is eligible.
            $table->foreignId('customer_group_id')->nullable()
                ->constrained('customer_groups')->nullOnDelete();

            $table->timestamp('starts_at')->nullable();
            $table->timestamp('expires_at')->nullable();

            $table->boolean('is_active')->default(true)->index();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();
        });

        DB::statement('
            ALTER TABLE coupons
            ADD CONSTRAINT chk_coupons_sane
            CHECK (
                value >= 0
                AND (max_discount_amount IS NULL OR max_discount_amount >= 0)
                AND (min_order_total IS NULL OR min_order_total >= 0)
                AND used_count >= 0
            )
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('coupons');
    }
};
