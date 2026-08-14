<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Carts and delivery charges.
 *
 * The one thing worth reading before the columns: a cart line stores WHAT and
 * HOW MANY, never HOW MUCH. Prices are recomputed from the catalogue on every
 * read.
 *
 * Storing a price on the cart line looks harmless and is the usual way this
 * goes wrong. It creates a second copy of the truth that drifts the moment a
 * price or a special offer changes, and then either the shop quietly honours
 * a price it no longer offers, or -- worse -- checkout trusts that stored
 * number because it came from the database rather than the browser. The
 * moment prices SHOULD freeze is when the order is placed, and that snapshot
 * belongs on the order, not here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('carts', function (Blueprint $table): void {
            $table->id();

            /*
             * The visitor's handle on their own cart.
             *
             * A random token rather than the session id: sessions are rotated
             * on login, and a shopper who fills a basket and then signs in
             * must not lose it. On sign-in the cart is claimed by setting
             * customer_id, and the token keeps working.
             */
            $table->uuid('token')->unique();

            $table->foreignId('customer_id')->nullable()
                ->constrained('customers')->nullOnDelete();

            /*
             * active    -> being shopped
             * converted -> became an order; kept for history, never reused
             * abandoned -> expired and released its stock
             *
             * Carts are not deleted. An abandoned cart is a fact about the
             * business worth reporting on later.
             */
            $table->enum('status', ['active', 'converted', 'abandoned'])
                ->default('active')->index();

            // Set when the last stock reservation would lapse, so the sweeper
            // has something indexed to find without joining the items.
            $table->timestamp('expires_at')->nullable()->index();
            $table->timestamp('last_activity_at')->nullable();

            $table->timestamps();

            $table->index(['customer_id', 'status']);
        });

        Schema::create('cart_items', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('cart_id')->constrained('carts')->cascadeOnDelete();
            $table->foreignId('product_variation_id')
                ->constrained('product_variations')->restrictOnDelete();

            $table->decimal('quantity', 15, 3);

            /*
             * The stock hold behind this line.
             *
             * Nullable because a line can outlive its reservation: the TTL
             * lapses, the sweeper releases the stock, and the line stays so
             * the shopper still sees what they picked -- with an honest "no
             * longer available" instead of a silently emptied basket.
             */
            $table->foreignId('stock_reservation_id')->nullable()
                ->constrained('stock_reservations')->nullOnDelete();

            $table->timestamps();

            // One line per variation. Adding the same item again adds to the
            // quantity; two rows for one product make every total a sum that
            // can disagree with itself.
            $table->unique(['cart_id', 'product_variation_id'], 'cart_items_unique_variation');
        });

        DB::statement('
            ALTER TABLE cart_items
            ADD CONSTRAINT chk_cart_items_positive
            CHECK (quantity > 0)
        ');

        /*
         * Delivery zones.
         *
         * Bangladesh in practice: "Inside Dhaka city", "Dhaka division
         * outside the city", "Rest of the country" -- three zones and one
         * charge each. The schema allows more without needing a migration.
         */
        Schema::create('shipping_zones', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('description')->nullable();

            /*
             * The zone that catches an address matching nothing else.
             *
             * Exactly one, enforced in the service. Without a fallback, an
             * address in a district nobody remembered to list produces no
             * quote at all, and the customer simply cannot check out -- a
             * lost sale that leaves no trace anywhere.
             */
            $table->boolean('is_fallback')->default(false)->index();

            $table->boolean('is_active')->default(true)->index();
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();
        });

        Schema::create('shipping_zone_areas', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shipping_zone_id')->constrained('shipping_zones')->cascadeOnDelete();

            // Matched case-insensitively against the delivery address.
            $table->string('district');

            /*
             * Null means "the whole district". A row WITH a city wins over
             * one without, so "Dhaka / Dhaka" (city) can be charged
             * differently from "Dhaka" (the surrounding district) without
             * listing every other city in it.
             */
            $table->string('city')->nullable();

            $table->timestamps();

            $table->unique(['district', 'city'], 'shipping_areas_unique_place');
            $table->index('shipping_zone_id');
        });

        Schema::create('shipping_rates', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shipping_zone_id')->constrained('shipping_zones')->cascadeOnDelete();

            $table->string('name');
            $table->string('description')->nullable();

            $table->decimal('base_charge', 15, 2)->default(0);

            /*
             * Weight is optional throughout. Most of this catalogue is small
             * electronics where one flat charge per zone is what customers
             * expect; a variation with no weight simply contributes nothing
             * here rather than blocking the quote.
             */
            $table->decimal('per_kg_charge', 15, 2)->default(0);
            $table->decimal('free_above_subtotal', 15, 2)->nullable();

            // Shown as "2-4 days", not used in any calculation.
            $table->unsignedSmallInteger('min_days')->nullable();
            $table->unsignedSmallInteger('max_days')->nullable();

            /*
             * Cash on delivery is a property of the DELIVERY method, not of
             * the shop: a courier that does not collect cash in a remote
             * district makes COD impossible for that zone, whatever the
             * payment settings say.
             */
            $table->boolean('supports_cod')->default(true);

            $table->boolean('is_active')->default(true)->index();
            $table->unsignedSmallInteger('position')->default(0);

            $table->timestamps();

            $table->index(['shipping_zone_id', 'is_active']);
        });

        DB::statement('
            ALTER TABLE shipping_rates
            ADD CONSTRAINT chk_shipping_rates_non_negative
            CHECK (base_charge >= 0 AND per_kg_charge >= 0
                   AND (free_above_subtotal IS NULL OR free_above_subtotal >= 0))
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('shipping_rates');
        Schema::dropIfExists('shipping_zone_areas');
        Schema::dropIfExists('shipping_zones');
        Schema::dropIfExists('cart_items');
        Schema::dropIfExists('carts');
    }
};
