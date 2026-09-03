<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Artwork for a payment method.
 *
 * Uploaded by the owner rather than shipped with the code: bKash, Nagad and
 * the card networks all publish brand assets to the merchants who accept
 * them, and it is the merchant who holds the right to use them. An
 * approximation drawn here would be both inaccurate and someone else's
 * trademark.
 *
 * Optional. Without one the storefront falls back to the method's name.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_methods', function (Blueprint $table): void {
            $table->string('logo')->nullable()->after('instructions');
        });
    }

    public function down(): void
    {
        Schema::table('payment_methods', function (Blueprint $table): void {
            $table->dropColumn('logo');
        });
    }
};
