<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A name a person chose, next to the one the file arrived with.
 *
 * `original_name` is whatever the camera or the supplier called it --
 * IMG_20260714_113052.jpg -- and it must stay exactly that, because it is
 * evidence of where the file came from. A library of two hundred of those is
 * unsearchable, so this is the name the shop gives the picture.
 *
 * Kept separate from `alt` on purpose: alt text is written for someone who
 * cannot see the image and describes it ("blue 65W charger, three ports"),
 * while a title is a label for whoever is looking for it in the picker.
 * Collapsing the two makes one of them wrong.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->string('title', 200)->nullable()->after('original_name');
        });
    }

    public function down(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->dropColumn('title');
        });
    }
};
