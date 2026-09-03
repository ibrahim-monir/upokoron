<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The transaction id the CUSTOMER says they paid with.
 *
 * Deliberately not a `payments` row. A payment is money the shop has
 * confirmed it has -- it posts to the ledger and moves the order's balance.
 * This is a claim typed into a form by whoever was holding the phone, and
 * until someone checks it against the bKash statement it is worth exactly
 * as much as any other thing a stranger typed. So it sits on the order as a
 * note for staff, and recording the payment stays a manual act.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            // Indexed because the question staff ask of it is "does this
            // id from the statement match any order", not "show me the id
            // for this order".
            $table->string('payment_reference', 64)->nullable()->after('payment_method_id')->index();
            $table->timestamp('payment_reference_at')->nullable()->after('payment_reference');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table): void {
            $table->dropIndex(['payment_reference']);
            $table->dropColumn(['payment_reference', 'payment_reference_at']);
        });
    }
};
