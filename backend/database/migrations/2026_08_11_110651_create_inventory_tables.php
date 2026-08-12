<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
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

            /*
             * `quantity` and `stock_value` are the two authoritative numbers.
             *
             * stock_value is DECIMAL(15,2) -- deliberately the SAME precision
             * as the general ledger, so that invariant I2 (sum of stock_value
             * equals the balance of account 1150 Inventory) can be checked for
             * exact equality rather than "close enough". At six decimals the
             * two could never agree exactly and the check would be worthless.
             */
            $table->decimal('stock_value', 15, 2)->default(0);

            /*
             * DERIVED, stored for display and reporting only. Recomputed from
             * stock_value / quantity on every movement. Never the input to a
             * COGS calculation on its own -- see CostingService for why the
             * final unit out of stock takes the whole remaining value.
             */
            $table->decimal('average_cost', 15, 6)->default(0);

            // Reorder planning. The user asked for all three explicitly.
            $table->decimal('min_stock', 15, 3)->default(0);
            $table->decimal('reorder_level', 15, 3)->default(0);
            $table->decimal('max_stock', 15, 3)->nullable();

            // Display only. COGS never comes from here.
            $table->decimal('last_purchase_price', 15, 6)->nullable();
            $table->timestamp('last_movement_at')->nullable();

            $table->timestamps();

            $table->index('quantity');
            $table->index('reorder_level');
        });

        /*
         * available_quantity is a generated STORED column, not a value the
         * application maintains. It therefore cannot drift from its own
         * inputs, and it can be indexed so "what can I actually sell" is a
         * plain indexed filter rather than an expression evaluated per row.
         */
        DB::statement('
            ALTER TABLE inventories
            ADD COLUMN available_quantity DECIMAL(15,3)
                AS (quantity - reserved_quantity) STORED,
            ADD INDEX inventories_available_quantity_index (available_quantity)
        ');

        // Last line of defence. Negative stock makes the weighted average
        // meaningless, and every COGS figure derived from it is garbage.
        DB::statement('
            ALTER TABLE inventories
            ADD CONSTRAINT chk_inventories_non_negative
            CHECK (quantity >= 0 AND reserved_quantity >= 0 AND stock_value >= 0)
        ');

        Schema::create('inventory_transactions', function (Blueprint $table) {
            $table->id();

            $table->foreignId('inventory_id')->constrained('inventories')->restrictOnDelete();
            $table->foreignId('product_variation_id')->constrained('product_variations')->restrictOnDelete();

            /*
             * No transfer_in / transfer_out: this is a single-inventory system
             * with no locations to transfer between. transit_out / transit_in
             * are NOT transfers either -- they move value between the
             * Inventory and Goods in Transit *accounts* when stock ships and
             * when a failed delivery comes back.
             */
            $table->enum('type', [
                'opening',
                'purchase',
                'purchase_return',
                'sale',
                'sale_return',
                'transit_out',
                'transit_in',
                'adjustment',
                'damage',
                'lost',
                'found',
            ]);

            $table->enum('direction', ['in', 'out']);

            // Always positive; `direction` carries the sign. A signed quantity
            // column invites SUM() queries that silently mix the two.
            $table->decimal('quantity', 15, 3);

            $table->decimal('unit_cost', 15, 6)->default(0);
            $table->decimal('total_cost', 15, 2)->default(0);

            // Full audit of the moving average at every single step, so a
            // wrong cost can be traced to the movement that caused it.
            $table->decimal('quantity_before', 15, 3);
            $table->decimal('quantity_after', 15, 3);
            $table->decimal('value_before', 15, 2);
            $table->decimal('value_after', 15, 2);
            $table->decimal('average_cost_after', 15, 6);

            $table->string('reference_type', 100)->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->string('reference_number', 40)->nullable();

            $table->foreignId('journal_entry_id')->nullable()->constrained('journal_entries')->nullOnDelete();

            $table->string('note', 500)->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamp('transacted_at');

            // Append-only: no updated_at, no soft delete. A stock ledger you
            // can edit is not a stock ledger.
            $table->timestamp('created_at')->useCurrent();

            /*
             * Blocks double posting at the database. A retried purchase
             * receipt or a double-clicked "ship" button cannot move the same
             * stock twice, whatever the calling code does.
             */
            $table->unique(
                ['reference_type', 'reference_id', 'product_variation_id', 'type'],
                'inventory_transactions_source_unique',
            );

            $table->index(['product_variation_id', 'transacted_at']);
            $table->index(['type', 'transacted_at']);
            $table->index(['reference_type', 'reference_id']);
        });

        /*
         * The reservation TABLE is the truth; inventories.reserved_quantity is
         * a cache of it.
         *
         * A bare counter cannot expire, so every abandoned checkout would hold
         * stock permanently. With rows, a scheduled command can release what
         * has timed out and reconcile the counter back to reality.
         */
        Schema::create('stock_reservations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_variation_id')->constrained('product_variations')->cascadeOnDelete();

            // Both nullable: a guest cart reserves before an order exists.
            $table->unsignedBigInteger('order_id')->nullable();
            $table->string('cart_token', 64)->nullable();

            $table->decimal('quantity', 15, 3);
            $table->enum('status', ['active', 'released', 'consumed'])->default('active');

            // Null means "hold indefinitely" -- used for confirmed COD orders,
            // which are not abandoned carts.
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('released_at')->nullable();

            $table->timestamps();

            $table->index(['status', 'expires_at']);
            $table->index(['product_variation_id', 'status']);
            $table->index('order_id');
            $table->index('cart_token');
        });

        DB::statement('
            ALTER TABLE stock_reservations
            ADD CONSTRAINT chk_stock_reservations_positive
            CHECK (quantity > 0)
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_reservations');
        Schema::dropIfExists('inventory_transactions');
        Schema::dropIfExists('inventories');
    }
};
