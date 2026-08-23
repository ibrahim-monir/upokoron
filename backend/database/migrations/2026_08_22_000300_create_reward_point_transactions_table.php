<?php

declare(strict_types=1);

use App\Enums\RewardPointType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every point a customer earned or spent, append-only.
 *
 * An earn row (purchase, review, profile completion, birthday, manual
 * credit) is also a FIFO lot: `remaining_points` starts equal to `points`
 * and is drawn down by later redemptions and by expiry, oldest lot first --
 * the same mechanic weighted-average costing uses for inventory, applied to
 * points instead of stock. A spend row (redeemed, expired, manual debit)
 * never carries a lot of its own; it only draws down earlier ones.
 *
 * `customers.reward_points_balance` is the number this table sums to. It is
 * kept in step with every insert here so a checkout does not have to sum the
 * whole history to answer "how many points does this customer have".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reward_point_transactions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();

            $table->enum('type', RewardPointType::values());

            // Positive for an earn or a manual credit, negative for a
            // redemption, an expiry, or a manual debit.
            $table->integer('points');

            // Only meaningful on an earn row: how much of this lot has not
            // yet been consumed by a later redemption or expiry.
            $table->unsignedInteger('remaining_points')->default(0);
            $table->timestamp('expires_at')->nullable();

            // What earned or spent these points, where one exists.
            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();
            $table->foreignId('product_review_id')->nullable()->constrained('product_reviews')->nullOnDelete();

            $table->string('note')->nullable();

            // Set only for a manual credit/debit -- who made the call.
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['customer_id', 'id']);
            $table->index(['type', 'expires_at']);
        });

        DB::statement('
            ALTER TABLE reward_point_transactions
            ADD CONSTRAINT chk_reward_point_transactions_remaining
            CHECK (remaining_points >= 0)
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('reward_point_transactions');
    }
};
