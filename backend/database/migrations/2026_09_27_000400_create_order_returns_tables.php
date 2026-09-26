<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Returns against a delivered order.
 *
 * requested -> approved -> received -> refunded, or requested -> rejected.
 * Stock and the books move at "received", when the goods are actually back
 * and someone has looked at them -- not at the request, which is only words.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('order_returns', function (Blueprint $table): void {
            $table->id();
            $table->string('number', 40)->unique();

            $table->foreignId('order_id')->constrained('orders')->restrictOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();

            $table->string('status', 20)->default('requested')->index();
            $table->string('reason', 40);
            $table->text('customer_note')->nullable();
            $table->text('staff_note')->nullable();

            // Worked out when the goods are received; what a refund may be.
            $table->decimal('refund_amount', 15, 2)->default(0);

            $table->timestamp('requested_at')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('rejected_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamp('refunded_at')->nullable();

            $table->foreignId('handled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('refund_payment_id')->nullable()->constrained('payments')->nullOnDelete();

            $table->timestamps();

            $table->index(['order_id', 'status']);
        });

        Schema::create('order_return_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_return_id')->constrained('order_returns')->cascadeOnDelete();
            $table->foreignId('order_item_id')->constrained('order_items')->restrictOnDelete();

            $table->decimal('quantity', 15, 3);

            // Set when received: back on the shelf, or written off as damaged.
            $table->boolean('restock')->nullable();

            $table->timestamps();

            $table->unique(['order_return_id', 'order_item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('order_return_items');
        Schema::dropIfExists('order_returns');
    }
};
