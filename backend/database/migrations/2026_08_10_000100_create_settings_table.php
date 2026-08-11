<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('group')->index();
            $table->text('value')->nullable();

            // How the string in `value` should be cast on the way out.
            $table->enum('type', ['string', 'integer', 'decimal', 'boolean', 'json', 'array'])
                ->default('string');

            // Public settings are exposed to the storefront without auth
            // (store name, currency). Everything else is admin-only.
            $table->boolean('is_public')->default(false)->index();
            $table->string('label')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};
