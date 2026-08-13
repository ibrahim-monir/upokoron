<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('media', function (Blueprint $table) {
            $table->id();

            $table->string('disk', 30)->default('uploads');
            $table->string('path');
            $table->string('filename');

            // What the uploader called it. Kept for searching only -- it is
            // never used as a filesystem path, because a client-supplied
            // filename is attacker-controlled.
            $table->string('original_name');

            $table->string('mime', 60);
            $table->unsignedBigInteger('size');
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();

            /*
             * SHA-256 of the file contents. Uploading the same picture twice
             * returns the existing row instead of filling the library with
             * duplicates that the owner then has to tell apart by thumbnail.
             */
            $table->string('hash', 64)->unique();

            $table->string('alt', 200)->nullable();
            $table->string('folder', 60)->default('general');

            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('folder');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('media');
    }
};
