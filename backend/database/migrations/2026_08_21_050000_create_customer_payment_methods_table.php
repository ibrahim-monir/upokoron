<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The payment details a customer saves for next time.
 *
 * Not to be confused with `payment_methods`, which is the shop's list of
 * what it accepts. This is one customer's own instrument -- "my bKash is
 * 01712345678" -- pointing at the shop method it pays through.
 *
 * WHAT THIS TABLE DELIBERATELY CANNOT HOLD: a card number or a CVV. There
 * are columns for a brand, the last four digits, an expiry and a gateway
 * token, which is everything needed to show a saved card and charge it
 * again through a processor. The number itself lives at the processor and
 * never here. Storing a CVV is forbidden outright once a payment is
 * authorised, and storing full card numbers without a processor turns one
 * database leak into every customer's card being stolen -- so the column to
 * put them in does not exist, and cannot be filled in by accident later.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_payment_methods', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();

            /*
             * Which of the shop's methods this pays through, so a saved
             * bKash number is offered for bKash and not for Nagad. Restricted
             * rather than cascaded: switching a method off should not silently
             * delete what customers saved against it.
             */
            $table->foreignId('payment_method_id')->constrained()->restrictOnDelete();

            $table->string('label', 50)->nullable();

            // The mobile wallet number money is sent from. Null on a card.
            $table->string('account_number', 30)->nullable();
            $table->string('account_name', 120)->nullable();

            // Card, when a gateway exists to tokenise one. All nullable and
            // all safe to leak: none of it can be used to charge anybody.
            $table->string('card_brand', 20)->nullable();
            $table->char('card_last4', 4)->nullable();
            $table->unsignedTinyInteger('card_expiry_month')->nullable();
            $table->unsignedSmallInteger('card_expiry_year')->nullable();
            $table->string('gateway_token', 191)->nullable();

            $table->boolean('is_default')->default(false);

            $table->timestamps();

            // Saving the same wallet against the same method twice is a
            // mistake every time, not a preference.
            $table->unique(
                ['customer_id', 'payment_method_id', 'account_number'],
                'customer_payment_methods_unique',
            );

            $table->index(['customer_id', 'is_default']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_payment_methods');
    }
};
