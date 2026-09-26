<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A product video, as a link (YouTube, or a direct .mp4/.webm file) rather
 * than an upload -- see frontend/src/lib/video.js for why.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->string('video_url', 500)->nullable()->after('shipping_class_id');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table): void {
            $table->dropColumn('video_url');
        });
    }
};
