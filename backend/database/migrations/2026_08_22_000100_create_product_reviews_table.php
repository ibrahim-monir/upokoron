<?php

declare(strict_types=1);

use App\Enums\ReviewStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A customer's rating and comment on a product they bought.
 *
 * One row per customer per product -- a second review replaces the first
 * rather than piling up, so "my review" is always a single, editable thing.
 * Editing resets status to Pending: the text changed, so it needs a fresh
 * look before it counts towards the product's public rating again.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_reviews', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();

            // Which delivered order proved this customer actually bought it.
            // Nullable only because the order it points to could in theory be
            // hard-deleted later; the review itself still stands on its own.
            $table->foreignId('order_item_id')->nullable()->constrained('order_items')->nullOnDelete();

            $table->unsignedTinyInteger('rating');
            $table->string('title', 150)->nullable();
            $table->text('comment');

            $table->enum('status', ReviewStatus::values())->default(ReviewStatus::Pending->value)->index();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->timestamps();

            $table->unique(['product_id', 'customer_id']);
            $table->index(['product_id', 'status']);
        });

        DB::statement('
            ALTER TABLE product_reviews
            ADD CONSTRAINT chk_product_reviews_rating
            CHECK (rating BETWEEN 1 AND 5)
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('product_reviews');
    }
};
