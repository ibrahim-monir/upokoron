<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Questions the shop is actually asked.
 *
 * A table rather than a block of text in Settings, because the storefront
 * needs each question separately to draw an accordion -- and because the
 * order they are answered in is a decision, not an accident of typing.
 *
 * Nothing is seeded. A made-up FAQ is filler that answers questions nobody
 * asked, and the section simply does not render until the owner writes one.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('faqs', function (Blueprint $table): void {
            $table->id();

            $table->string('question', 300);
            $table->text('answer');

            $table->unsignedSmallInteger('position')->default(0);

            // Withdrawn rather than deleted: an answer that is wrong for this
            // season is usually right again next one.
            $table->boolean('is_active')->default(true);

            $table->timestamps();

            $table->index(['is_active', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('faqs');
    }
};
