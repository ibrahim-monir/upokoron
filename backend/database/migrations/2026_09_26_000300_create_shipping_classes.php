<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Shipping classes: a label on a product ("Heavy", "Fragile") that each
 * delivery option can charge extra for.
 *
 * The extra lives on the pair (option, class) rather than on the class, so a
 * heavy parcel can cost ৳100 more inside Dhaka and ৳150 more outside it --
 * which is how couriers here actually price.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipping_classes', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 120);
            $table->string('slug', 140)->unique();
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('shipping_class_rates', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shipping_rate_id')->constrained('shipping_rates')->cascadeOnDelete();
            $table->foreignId('shipping_class_id')->constrained('shipping_classes')->cascadeOnDelete();
            $table->decimal('charge', 15, 2)->default(0);
            $table->timestamps();

            $table->unique(['shipping_rate_id', 'shipping_class_id'], 'shipping_class_rates_unique_pair');
        });

        Schema::table('products', function (Blueprint $table): void {
            // Deleting a class leaves its products as ordinary ones rather
            // than taking them with it.
            $table->foreignId('shipping_class_id')->nullable()->after('free_shipping')
                ->constrained('shipping_classes')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('shipping_class_id');
        });

        Schema::dropIfExists('shipping_class_rates');
        Schema::dropIfExists('shipping_classes');
    }
};
