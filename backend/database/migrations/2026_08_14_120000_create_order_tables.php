<?php

declare(strict_types=1);

use App\Enums\OrderStatus;
use App\Enums\PaymentMethodType;
use App\Enums\PaymentStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Orders, what was in them, and what was paid.
 *
 * The cart deliberately stores no prices. The order is the opposite: it
 * stores EVERYTHING, frozen. Name, SKU, price, discount, delivery charge, the
 * address, the cost of the goods -- all copied at the moment of sale.
 *
 * That is not duplication for its own sake. A product gets renamed, a price
 * changes, an address is edited, a variation is archived; none of that may
 * alter what an invoice from last March says. And the cost figure especially:
 * profit on a past sale is calculated from the cost recorded WITH that sale,
 * never from what the item costs today.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_methods', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('code', 40)->unique();
            $table->enum('type', array_column(PaymentMethodType::cases(), 'value'));

            // Shown at checkout: "Send to 01XXXXXXXXX and enter the
            // transaction id below."
            $table->text('instructions')->nullable();

            /*
             * Where money received by this method lands.
             *
             * Per row rather than per type, so "bKash personal" and "bKash
             * merchant" post to different accounts and can be told apart in
             * a report. Falls back to the type's default when null.
             */
            $table->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();

            $table->decimal('extra_charge', 15, 2)->default(0);
            $table->decimal('min_order_total', 15, 2)->nullable();
            $table->decimal('max_order_total', 15, 2)->nullable();

            $table->boolean('is_active')->default(true)->index();
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();
        });

        Schema::create('orders', function (Blueprint $table): void {
            $table->id();

            // Human-facing and permanent, e.g. 08260123 (month, year, running number).
            $table->string('number', 40)->unique();

            $table->foreignId('customer_id')->nullable()
                ->constrained('customers')->restrictOnDelete();

            // Which basket became this order. Kept for support questions and
            // abandoned-cart reporting; nullable because staff can key in a
            // phone order that never had a cart.
            $table->foreignId('cart_id')->nullable()->constrained('carts')->nullOnDelete();

            $table->enum('status', OrderStatus::values())->default(OrderStatus::Pending->value)->index();
            $table->enum('payment_status', array_column(PaymentStatus::cases(), 'value'))
                ->default(PaymentStatus::Unpaid->value)->index();

            $table->foreignId('payment_method_id')->nullable()
                ->constrained('payment_methods')->nullOnDelete();

            /*
             * The delivery address, copied in full.
             *
             * Not a foreign key to customer_addresses: a customer editing
             * their address book must not silently rewrite where a parcel was
             * sent last year. The id is kept alongside for reference only.
             */
            $table->foreignId('customer_address_id')->nullable()
                ->constrained('customer_addresses')->nullOnDelete();

            $table->string('ship_name');
            $table->string('ship_phone', 20);
            $table->string('ship_address_line1');
            $table->string('ship_address_line2')->nullable();
            $table->string('ship_area')->nullable();
            $table->string('ship_city');
            $table->string('ship_district');
            $table->string('ship_postcode', 20)->nullable();
            $table->string('ship_country', 2)->default('BD');

            // The delivery choice, also frozen: the zone can be re-priced
            // tomorrow without changing what this customer was charged.
            $table->foreignId('shipping_zone_id')->nullable()
                ->constrained('shipping_zones')->nullOnDelete();
            $table->foreignId('shipping_rate_id')->nullable()
                ->constrained('shipping_rates')->nullOnDelete();
            $table->string('shipping_method_name')->nullable();

            /*
             * Money. Every one of these is computed on the server from the
             * cart and the catalogue; nothing here is ever read from the
             * request body.
             *
             *   subtotal        sum of line totals, after per-line discounts
             *   discount_total  what those discounts came to
             *   shipping_charge delivery
             *   extra_charge    payment-method surcharge, e.g. COD fee
             *   total           what the customer owes
             */
            $table->decimal('subtotal', 15, 2);
            $table->decimal('discount_total', 15, 2)->default(0);
            $table->decimal('shipping_charge', 15, 2)->default(0);
            $table->decimal('extra_charge', 15, 2)->default(0);
            $table->decimal('total', 15, 2);

            $table->decimal('paid_total', 15, 2)->default(0);
            $table->decimal('refunded_total', 15, 2)->default(0);

            /*
             * Cost of the goods, frozen when they ship.
             *
             * The single most important number in this table for reporting.
             * Profit on this order is total minus THIS, forever -- never
             * recalculated from today's cost price.
             */
            $table->decimal('cost_total', 15, 2)->default(0);

            $table->decimal('weight_kg', 15, 3)->default(0);

            $table->text('customer_note')->nullable();
            $table->text('staff_note')->nullable();
            $table->string('cancel_reason')->nullable();

            $table->timestamp('placed_at')->nullable()->index();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('returned_at')->nullable();

            $table->foreignId('placed_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['customer_id', 'status']);
            $table->index(['status', 'placed_at']);
        });

        DB::statement('
            ALTER TABLE orders
            ADD CONSTRAINT chk_orders_money_non_negative
            CHECK (subtotal >= 0 AND discount_total >= 0 AND shipping_charge >= 0
                   AND extra_charge >= 0 AND total >= 0 AND paid_total >= 0
                   AND refunded_total >= 0 AND cost_total >= 0)
        ');

        Schema::create('order_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();

            // restrictOnDelete: a variation that has been sold cannot be
            // deleted out from under the order that sold it.
            $table->foreignId('product_variation_id')
                ->constrained('product_variations')->restrictOnDelete();

            // Copies, so the line reads correctly even after a rename.
            $table->string('product_name');
            $table->string('variation_name')->nullable();
            $table->string('sku', 60);

            $table->decimal('quantity', 15, 3);
            $table->decimal('list_price', 15, 2);
            $table->decimal('unit_price', 15, 2);
            $table->decimal('unit_discount', 15, 2)->default(0);
            $table->decimal('line_total', 15, 2);
            $table->decimal('line_discount', 15, 2)->default(0);

            /*
             * Weighted average cost at the moment the goods left, per unit
             * and in total. Written once, when the order ships, and never
             * touched again.
             */
            $table->decimal('unit_cost', 15, 6)->nullable();
            $table->decimal('total_cost', 15, 2)->nullable();

            // The movement that took this line out of stock, so a line can be
            // traced to the exact inventory transaction and journal entry.
            $table->foreignId('inventory_transaction_id')->nullable()
                ->constrained('inventory_transactions')->nullOnDelete();

            $table->decimal('quantity_returned', 15, 3)->default(0);

            $table->timestamps();

            $table->index('product_variation_id');
        });

        DB::statement('
            ALTER TABLE order_items
            ADD CONSTRAINT chk_order_items_sane
            CHECK (quantity > 0 AND unit_price >= 0 AND line_total >= 0
                   AND quantity_returned >= 0 AND quantity_returned <= quantity)
        ');

        /*
         * Every status change, who made it and when.
         *
         * Append-only. "Why was this cancelled and by whom" is the first
         * question asked about any disputed order, and an audit trail that
         * can be edited is not one.
         */
        Schema::create('order_status_history', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('order_id')->constrained('orders')->cascadeOnDelete();

            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->string('note')->nullable();

            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamp('created_at')->nullable();

            $table->index(['order_id', 'id']);
        });

        Schema::create('payments', function (Blueprint $table): void {
            $table->id();
            $table->string('number', 40)->unique();

            $table->foreignId('order_id')->constrained('orders')->restrictOnDelete();
            $table->foreignId('payment_method_id')->nullable()
                ->constrained('payment_methods')->nullOnDelete();

            /*
             * Positive for money in, negative for a refund.
             *
             * One signed column rather than two tables: the balance owing is
             * then a single SUM, and a refund can never be forgotten by a
             * query that only knew about receipts.
             */
            $table->decimal('amount', 15, 2);

            // bKash transaction id, courier settlement reference, and so on.
            $table->string('reference')->nullable()->index();
            $table->string('note')->nullable();

            $table->foreignId('account_id')->nullable()->constrained('accounts')->nullOnDelete();

            // The ledger entry this created. Payments are never deleted; a
            // mistake is corrected with an opposing entry.
            $table->foreignId('journal_entry_id')->nullable()
                ->constrained('journal_entries')->nullOnDelete();

            $table->timestamp('received_at')->index();
            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['order_id', 'received_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
        Schema::dropIfExists('order_status_history');
        Schema::dropIfExists('order_items');
        Schema::dropIfExists('orders');
        Schema::dropIfExists('payment_methods');
    }
};
