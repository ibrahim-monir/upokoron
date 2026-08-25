<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The accessories that go with a product.
 *
 * "Related products" means the same category, so a battery offers more
 * batteries -- alternatives to something already chosen. What the shopper
 * needs is the wire, the connector, the bulb. These are picked per product,
 * so a 100Ah battery can suggest heavier cable than a 7Ah one does.
 *
 * Directional. A battery suggesting a connector does not have to mean the
 * connector suggests that battery back, and where it should, it is picked
 * on both.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_pairings', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('paired_product_id')->constrained('products')->cascadeOnDelete();

            // The order they were arranged in, which is the order the
            // storefront offers them in.
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->unique(['product_id', 'paired_product_id']);
            $table->index(['product_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_pairings');
    }
};
