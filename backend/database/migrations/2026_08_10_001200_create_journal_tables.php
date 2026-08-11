<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->string('number', 30)->unique();
            $table->date('entry_date');
            $table->foreignId('fiscal_period_id')->constrained('fiscal_periods')->restrictOnDelete();

            /*
             * What business event produced this entry. The unique index below
             * is the whole idempotency story: a retried payment webhook, a
             * re-run job, or a double-clicked button physically cannot post
             * the same event twice for the same document. Enforced by MySQL,
             * not by application logic that someone might later bypass.
             */
            $table->string('reference_type', 100)->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();
            $table->string('event', 60);

            $table->string('memo', 255)->nullable();
            $table->decimal('total_debit', 15, 2);
            $table->decimal('total_credit', 15, 2);

            $table->enum('status', ['posted', 'reversed', 'reversal'])->default('posted');
            $table->foreignId('reversal_of_entry_id')->nullable()->constrained('journal_entries')->restrictOnDelete();
            $table->foreignId('reversed_by_entry_id')->nullable()->constrained('journal_entries')->restrictOnDelete();
            $table->string('reversal_reason', 255)->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('posted_at');

            // No updated_at and no deleted_at, on purpose. A posted entry is
            // immutable; corrections happen as reversing entries.
            $table->timestamp('created_at')->nullable();

            $table->unique(
                ['reference_type', 'reference_id', 'event'],
                'journal_entries_source_event_unique',
            );
            $table->index(['entry_date', 'status']);
            $table->index(['reference_type', 'reference_id']);
        });

        Schema::create('journal_entry_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('journal_entry_id')->constrained('journal_entries')->cascadeOnDelete();
            $table->unsignedSmallInteger('line_no');
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();

            // Denormalised from the parent entry. Ledger and trial balance
            // queries filter by date across millions of lines; carrying the
            // date here turns those into a single indexed scan instead of a
            // join back to journal_entries on every row.
            $table->date('entry_date');

            $table->decimal('debit', 15, 2)->default(0);
            $table->decimal('credit', 15, 2)->default(0);

            /*
             * Subledger identity. A line tagged with a customer or supplier is
             * what makes the customer and supplier ledgers derivable from the
             * GL itself, rather than kept in a parallel table that drifts.
             */
            $table->string('party_type', 100)->nullable();
            $table->unsignedBigInteger('party_id')->nullable();

            $table->string('memo', 255)->nullable();

            $table->unique(['journal_entry_id', 'line_no']);
            $table->index(['account_id', 'entry_date']);
            $table->index(['party_type', 'party_id', 'entry_date'], 'jel_party_date_index');
        });

        // Exactly one side of every line must carry a value, and neither side
        // may be negative. A negative debit is just a credit wearing a
        // disguise, and it breaks every report that sums one column.
        DB::statement('
            ALTER TABLE journal_entry_lines
            ADD CONSTRAINT chk_jel_single_sided
            CHECK (
                debit >= 0 AND credit >= 0
                AND (debit = 0 OR credit = 0)
                AND (debit > 0 OR credit > 0)
            )
        ');
    }

    public function down(): void
    {
        Schema::dropIfExists('journal_entry_lines');
        Schema::dropIfExists('journal_entries');
    }
};
