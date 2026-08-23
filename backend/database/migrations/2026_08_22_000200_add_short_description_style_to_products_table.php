<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How the short description reads on the product page: one blurb, or a
 * bullet per line. Admin's choice, not a guess made from the text -- so it
 * survives an edit that briefly leaves the field with only one line in it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->enum('short_description_style', ['paragraph', 'list'])
                ->default('paragraph')
                ->after('short_description');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn('short_description_style');
        });
    }
};
