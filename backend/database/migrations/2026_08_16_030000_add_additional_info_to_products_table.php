<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            // Free-form Feature/Description rows for the storefront's
            // Additional Information tab -- things worth stating (seat
            // material, included accessories) that don't need a reusable,
            // filterable Attribute defined first. An array of
            // {feature, description}, in display order.
            $table->json('additional_info')->nullable()->after('warranty');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn('additional_info');
        });
    }
};
