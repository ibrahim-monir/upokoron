<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A home page banner is a picture and a link now, nothing else.
 *
 * The overlay -- eyebrow, title, body, button label -- went away with these
 * columns. Artwork for a slide is made in a design tool, where the words can
 * sit where the picture wants them; typing a second, separate headline into
 * the admin panel put text over a photograph that was already carrying its
 * own, and no amount of gradient made both readable at once.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('banners', function (Blueprint $table) {
            $table->dropColumn(['eyebrow', 'title', 'body', 'cta_label']);
        });
    }

    /**
     * The columns come back empty: the copy that was in them is gone, and
     * inventing a title for an existing row would be worse than a blank one.
     * `title` is nullable here for the same reason -- the original NOT NULL
     * cannot be honoured for rows that already exist.
     */
    public function down(): void
    {
        Schema::table('banners', function (Blueprint $table) {
            $table->string('eyebrow')->nullable()->after('id');
            $table->string('title')->nullable()->after('eyebrow');
            $table->string('body')->nullable()->after('title');
            $table->string('cta_label')->default('Shop now')->after('body');
        });
    }
};
