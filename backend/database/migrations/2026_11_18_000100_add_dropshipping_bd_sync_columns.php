<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * DropShipping.com.bd sync: price/stock tracking per imported product, and
 * resumable multi-source runs. The Mohasagor import that used these tables
 * first is gone; its rows (provider = mohasagor) are left untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dropshipping_catalog_items', function (Blueprint $table): void {
            $table->string('product_code', 60)->nullable()->after('provider_product_id');
            $table->decimal('cost_price', 12, 2)->nullable()->after('provider_category_id');
            $table->decimal('retail_price', 12, 2)->nullable()->after('cost_price');
            $table->integer('supplier_stock')->nullable()->after('retail_price');
            $table->boolean('in_stock')->default(true)->after('supplier_stock');
            $table->boolean('hidden_by_sync')->default(false)->after('in_stock');
            $table->boolean('price_locked')->default(false)->after('hidden_by_sync');
            $table->unsignedBigInteger('last_run_id')->nullable()->after('price_locked');
            $table->timestamp('synced_at')->nullable()->after('last_seen_at');

            $table->index(['provider', 'product_code'], 'dropshipping_item_provider_code_index');
        });

        Schema::table('dropshipping_import_runs', function (Blueprint $table): void {
            $table->string('provider', 40)->default('mohasagor')->after('id');
            $table->string('trigger', 20)->default('manual')->after('status');
            $table->unsignedInteger('source_index')->default(0)->after('category_id');
            $table->unsignedInteger('source_count')->default(0)->after('source_index');
            $table->unsignedInteger('updated_count')->default(0)->after('created_count');
            $table->unsignedInteger('hidden_count')->default(0)->after('updated_count');
            $table->unsignedInteger('seen_count')->default(0)->after('hidden_count');
            $table->unsignedInteger('total_count')->default(0)->after('seen_count');
        });
    }

    public function down(): void
    {
        Schema::table('dropshipping_catalog_items', function (Blueprint $table): void {
            $table->dropIndex('dropshipping_item_provider_code_index');
            $table->dropColumn(['product_code', 'cost_price', 'retail_price', 'supplier_stock', 'in_stock',
                'hidden_by_sync', 'price_locked', 'last_run_id', 'synced_at']);
        });

        Schema::table('dropshipping_import_runs', function (Blueprint $table): void {
            $table->dropColumn(['provider', 'trigger', 'source_index', 'source_count', 'updated_count',
                'hidden_count', 'seen_count', 'total_count']);
        });
    }
};
