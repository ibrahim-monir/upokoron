<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Whether a cart line is included in the NEXT checkout.
 *
 * Defaults true, so every line already in a basket -- and every line added
 * from here on -- behaves exactly as it did before this column existed:
 * checkout takes the whole cart. Unchecking a line only changes what the
 * "Proceed to checkout" button below the total actually buys; the item
 * itself is never removed by unchecking it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cart_items', function (Blueprint $table): void {
            $table->boolean('is_selected')->default(true)->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('cart_items', function (Blueprint $table): void {
            $table->dropColumn('is_selected');
        });
    }
};
