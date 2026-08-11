<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_types', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60);
            $table->string('code', 30)->unique();
            $table->enum('category', ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense']);
            $table->enum('normal_balance', ['debit', 'credit']);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->index('category');
        });

        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name', 120);
            $table->foreignId('account_type_id')->constrained('account_types')->restrictOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('accounts')->restrictOnDelete();

            // Group accounts are headers. Nothing posts to them directly;
            // they only aggregate their children on reports.
            $table->boolean('is_group')->default(false);

            /*
             * How services find an account without hardcoding an id or
             * matching on a name. AccountResolver looks up 'inventory',
             * 'cogs', 'accounts_receivable' and so on, which means the store
             * owner can rename or renumber their chart freely and every
             * posting rule keeps working.
             */
            $table->string('system_key', 60)->nullable()->unique();

            // System accounts cannot be deleted or reclassified: the posting
            // rules depend on them existing with the right category.
            $table->boolean('is_system')->default(false);

            $table->decimal('opening_balance', 15, 2)->default(0);
            $table->date('opening_balance_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('description')->nullable();
            $table->timestamps();

            $table->index(['account_type_id', 'is_active']);
            $table->index('parent_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('accounts');
        Schema::dropIfExists('account_types');
    }
};
