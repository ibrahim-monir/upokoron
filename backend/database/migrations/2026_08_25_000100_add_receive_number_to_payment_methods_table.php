<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The merchant's own bKash/Nagad number (or any other "send it here" value
 * an MFS or manual-transfer method needs) -- separate from `instructions`,
 * which is free text, so the storefront can show it as its own highlighted
 * line rather than however it happens to be worded inside a paragraph.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('payment_methods', function (Blueprint $table): void {
            $table->string('receive_number', 32)->nullable()->after('instructions');
        });
    }

    public function down(): void
    {
        Schema::table('payment_methods', function (Blueprint $table): void {
            $table->dropColumn('receive_number');
        });
    }
};
