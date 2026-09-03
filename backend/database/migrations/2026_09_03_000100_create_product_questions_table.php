<?php

declare(strict_types=1);

use App\Enums\QuestionStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Does this fit a 12V supply?" -- a shopper's question about a product, and
 * the shop's answer to it.
 *
 * Deliberately open to guests, unlike product_reviews: a question is asked
 * BEFORE buying, so requiring an account first would silence exactly the
 * people it exists to serve. Two things stand in for the missing login --
 * every row starts Pending and is invisible until staff approve it, and the
 * asker's IP is kept so an abusive source can be blocked.
 *
 * The answer lives on the same row rather than in a replies table. Only the
 * shop answers, and only once: a thread would imply a conversation this is
 * not, and WhatsApp already exists for that.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_questions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();

            // Set when a signed-in customer asks, so their account can be
            // recognised later. Null for a guest, which is the normal case.
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();

            // Shown beside the question. Asked for even from guests, because
            // "Rahim asked" reads as a person and "Anonymous" reads as spam.
            $table->string('asker_name', 120);

            // Optional, never published -- it is only there so staff can tell
            // someone their question has been answered.
            $table->string('asker_email', 190)->nullable();

            $table->text('question');

            // Null until staff reply. An approved question with no answer yet
            // still shows: other shoppers wondering the same thing is useful
            // information, and it puts visible pressure on the shop to reply.
            $table->text('answer')->nullable();
            $table->foreignId('answered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('answered_at')->nullable();

            $table->enum('status', QuestionStatus::values())->default(QuestionStatus::Pending->value);

            // For blocking a source that turns abusive. Not shown in the
            // panel: it identifies a person, and moderating does not need it.
            $table->string('ip_address', 45)->nullable();

            $table->timestamps();

            // The product page reads approved questions newest first.
            $table->index(['product_id', 'status']);

            // The panel's default view: everything still waiting on staff.
            $table->index(['status', 'answered_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_questions');
    }
};
