<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Concurrency-safe document numbering.
     *
     * MAX(id)+1 produces duplicate order numbers the first time two customers
     * check out in the same instant. DocumentNumberService instead takes a row
     * lock on the matching row here and increments `next_number`, so a number
     * is allocated exactly once even under load.
     *
     * The period columns let a sequence restart each year or month while
     * staying unique: (key, period_year, period_month) is the identity.
     */
    public function up(): void
    {
        Schema::create('document_sequences', function (Blueprint $table) {
            $table->id();
            $table->string('key', 50);
            $table->string('prefix', 20);
            $table->unsignedInteger('period_year')->default(0);
            $table->unsignedTinyInteger('period_month')->default(0);
            $table->unsignedBigInteger('next_number')->default(1);
            $table->unsignedTinyInteger('padding')->default(6);
            $table->enum('reset_period', ['none', 'yearly', 'monthly'])->default('yearly');
            $table->timestamps();

            $table->unique(['key', 'period_year', 'period_month'], 'document_sequences_identity_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_sequences');
    }
};
