<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dropshipping_import_runs', function (Blueprint $table): void {
            $table->unsignedInteger('page_from')->default(1)->after('status');
            $table->unsignedInteger('page_to')->nullable()->after('page_from');
            $table->string('category_id', 100)->nullable()->after('page_to');
        });
    }

    public function down(): void
    {
        Schema::table('dropshipping_import_runs', function (Blueprint $table): void {
            $table->dropColumn(['page_from', 'page_to', 'category_id']);
        });
    }
};
