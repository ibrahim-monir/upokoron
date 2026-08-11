<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Every product has at least one variation row, including simple ones,
     * which get a single default variation created automatically.
     *
     * That costs one row per simple product and buys a single code path:
     * inventory, order items, purchase items, and every report join to
     * `product_variations` and never branch on product type. The alternative
     * is an `if ($product->has_variations)` in twenty places, and the bug is
     * always in the branch nobody tested.
     */
    public function up(): void
    {
        Schema::create('product_variations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();

            $table->string('sku', 60)->unique();
            $table->string('barcode', 60)->nullable()->unique();

            // Rendered from the attribute values, e.g. "Red / XL".
            $table->string('name', 200)->nullable();

            $table->decimal('selling_price', 15, 2);

            // Shown struck through. Marketing only; never used in any total.
            $table->decimal('compare_at_price', 15, 2)->nullable();

            // Scheduled sale price. PricingService picks it up only inside
            // the window, and the storefront never sets the price itself.
            $table->decimal('special_price', 15, 2)->nullable();
            $table->timestamp('special_starts_at')->nullable();
            $table->timestamp('special_ends_at')->nullable();

            /*
             * Display only. Cost of goods sold NEVER comes from here -- it
             * comes from `inventory.stock_value` at the moment of sale, and is
             * then frozen onto the order item. Computing historical profit
             * from a current price is the single easiest way to report a
             * number that cannot be reproduced.
             */
            $table->decimal('last_purchase_price', 15, 6)->nullable();

            $table->decimal('weight', 10, 3)->nullable();
            $table->foreignId('image_id')->nullable()->constrained('product_images')->nullOnDelete();

            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();
            $table->softDeletes();

            $table->index(['product_id', 'is_active']);
        });

        Schema::create('product_variation_values', function (Blueprint $table) {
            $table->foreignId('product_variation_id')->constrained('product_variations')->cascadeOnDelete();
            $table->foreignId('attribute_id')->constrained('attributes')->restrictOnDelete();
            $table->foreignId('attribute_value_id')->constrained('attribute_values')->restrictOnDelete();

            $table->primary(['product_variation_id', 'attribute_id'], 'pvv_primary');
            $table->index('attribute_value_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variation_values');
        Schema::dropIfExists('product_variations');
    }
};
