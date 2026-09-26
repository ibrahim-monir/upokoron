<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A trash for orders, so deleting a test order can be undone.
 *
 * Only orders that never shipped and were never paid can be trashed (see
 * OrderDeletionService), so a trashed row never has ledger entries or stock
 * movements hanging off it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropSoftDeletes();
        });
    }
};
