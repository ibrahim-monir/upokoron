<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inventories', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_variation_id')
                ->unique()
                ->constrained('product_variations')
                ->cascadeOnDelete();

            $table->decimal('quantity', 15, 3)->default(0);

            $table->decimal('reserved_quantity', 15, 3)->default(0);

            $table->decimal('average_cost', 15, 6)->default(0);

            $table->decimal('stock_value', 18, 6)->default(0);

            $table->timestamps();

            $table->index('quantity');
            $table->index('reserved_quantity');
        });

        Schema::create('inventory_transactions', function (Blueprint $table) {
            $table->id();

            $table->foreignId('inventory_id')
                ->constrained('inventories')
                ->restrictOnDelete();

            $table->foreignId('product_variation_id')
                ->constrained('product_variations')
                ->restrictOnDelete();

            $table->enum('type', [
                'opening',
                'purchase',
                'sale',
                'purchase_return',
                'sale_return',
                'adjustment',
                'damage',
                'transfer_in',
                'transfer_out',
            ]);

            $table->decimal('quantity', 15, 3);

            $table->decimal('unit_cost', 15, 6)->default(0);

            $table->decimal('total_cost', 18, 6)->default(0);

            $table->decimal('balance_quantity', 15, 3);

            $table->decimal('balance_value', 18, 6);

            $table->string('reference_type', 100)->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();

            $table->string('note', 500)->nullable();

            $table->foreignId('created_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamp('created_at')->useCurrent();

            $table->index([
                'product_variation_id',
                'created_at',
            ]);

            $table->index([
                'reference_type',
                'reference_id',
            ]);

            $table->index('type');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_transactions');
        Schema::dropIfExists('inventories');
    }
};