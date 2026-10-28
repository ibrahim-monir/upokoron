<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dropshipping_catalog_items', function (Blueprint $table): void {
            $table->id();
            $table->string('provider', 40)->default('mohasagor');
            $table->string('provider_product_id', 100);
            $table->string('provider_category_id', 100)->nullable();
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            // Keep every supplier field, including variant/attribute IDs that
            // the current response does not expand into readable labels.
            $table->json('source_payload');
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->unique(['provider', 'provider_product_id'], 'dropshipping_item_provider_id_unique');
            $table->index('provider_category_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dropshipping_catalog_items');
    }
};
