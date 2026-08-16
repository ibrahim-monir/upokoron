<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('banners', function (Blueprint $table) {
            $table->id();
            $table->string('eyebrow')->nullable();
            $table->string('title');
            $table->string('body')->nullable();
            $table->string('cta_label')->default('Shop now');

            // A path within this site (/products?category=audio), not an
            // arbitrary external URL -- a banner is for sending shoppers
            // deeper into the shop, not off it.
            $table->string('link')->default('/products');

            // One of a fixed set of gradient pairs declared in the frontend.
            // Tailwind's JIT compiler only generates CSS for class names it
            // can see statically in source, so a free-text colour here would
            // resolve to nothing at build time -- the key has to name a
            // preset the frontend already spells out literally.
            $table->string('theme')->default('brand');

            // Optional background image, shown under a gradient overlay so
            // the text stays legible. Null keeps the plain gradient + dot
            // texture look.
            $table->string('image')->nullable();

            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();

            $table->unsignedInteger('position')->default(0);
            $table->boolean('is_active')->default(true);

            $table->timestamps();

            $table->index(['is_active', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('banners');
    }
};
