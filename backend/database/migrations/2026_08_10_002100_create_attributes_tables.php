<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attributes', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60);
            $table->string('slug', 70)->unique();

            // How the storefront renders the picker: a dropdown, a colour
            // swatch, or free text.
            $table->enum('type', ['select', 'color', 'text'])->default('select');

            // Only variant attributes multiply into variations. A "Material"
            // attribute can describe a product without creating a SKU per
            // material, which is the difference between 6 variations and 60.
            $table->boolean('is_variant')->default(true);

            $table->boolean('is_filterable')->default(true);
            $table->unsignedSmallInteger('position')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('attribute_values', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attribute_id')->constrained('attributes')->cascadeOnDelete();
            $table->string('value', 80);
            $table->string('slug', 90);
            $table->string('color_hex', 7)->nullable();
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            // "Red" may exist under Colour and under Ink Colour, but not
            // twice under the same attribute.
            $table->unique(['attribute_id', 'slug']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attribute_values');
        Schema::dropIfExists('attributes');
    }
};
