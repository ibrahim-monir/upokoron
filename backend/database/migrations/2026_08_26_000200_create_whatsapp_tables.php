<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The WhatsApp support inbox.
 *
 * One conversation per customer phone number, because that is what WhatsApp
 * itself keys on: a person is their number, and every message they have ever
 * sent the shop belongs to the same thread whether or not they have an
 * account here.
 *
 * Messages are stored in full rather than fetched from Meta on demand. The
 * Cloud API has no "give me this conversation" endpoint -- webhooks are the
 * only delivery, each one arriving exactly once and never again -- so a
 * message not written down here is a message the shop has lost.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('whatsapp_conversations', function (Blueprint $table): void {
            $table->id();

            // The customer's number in WhatsApp's own form: digits only, with
            // country code, no plus. Unique, because it IS the conversation.
            $table->string('wa_id', 32)->unique();

            // Whatever WhatsApp says they call themselves. Not to be trusted
            // as identity -- it is a display name they set on their own phone.
            $table->string('profile_name')->nullable();

            /*
             * The account this number belongs to, when one can be found.
             *
             * Nullable and never required: most people asking a question have
             * not bought anything yet, and refusing to record a conversation
             * because it has no customer row would lose exactly the enquiries
             * a shop most wants.
             */
            $table->foreignId('customer_id')->nullable()
                ->constrained('customers')->nullOnDelete();

            $table->timestamp('last_message_at')->nullable()->index();

            /*
             * When the customer last wrote.
             *
             * Not decoration: WhatsApp only allows free-form replies within
             * 24 hours of a customer's message. After that a business may
             * send approved templates and nothing else. Kept as its own
             * column so the rule can be enforced without walking the thread.
             */
            $table->timestamp('customer_last_message_at')->nullable();

            // Counted rather than derived: the sidebar badge asks for this on
            // every poll, and COUNT over a growing message table to answer
            // "is there anything new" is a query the inbox does not need.
            $table->unsignedInteger('unread_count')->default(0);

            $table->timestamp('archived_at')->nullable();

            $table->timestamps();
        });

        Schema::create('whatsapp_messages', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('whatsapp_conversation_id')
                ->constrained('whatsapp_conversations')->cascadeOnDelete();

            /*
             * WhatsApp's own id for the message, and the reason this column
             * is unique: Meta retries a webhook until it is acknowledged, so
             * the same message arrives more than once whenever a response is
             * slow. Without this the thread quietly doubles.
             */
            $table->string('wa_message_id', 128)->nullable()->unique();

            // 'in' from the customer, 'out' from the shop.
            $table->enum('direction', ['in', 'out'])->index();

            // text, image, document, audio, video, sticker, location... The
            // body holds what can be read; anything else is described rather
            // than downloaded, since media on Meta's servers expires.
            $table->string('type', 32)->default('text');
            $table->text('body')->nullable();

            /*
             * sent -> delivered -> read, as Meta reports it, or failed.
             * Inbound messages are simply 'received': the shop cannot know
             * whether the customer's own phone marked it anything.
             */
            $table->string('status', 20)->default('sent')->index();
            $table->string('error')->nullable();

            // Who at the shop sent it. Null for inbound, and for anything the
            // system sent on its own.
            $table->foreignId('sent_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamp('sent_at')->index();

            $table->timestamps();

            $table->index(['whatsapp_conversation_id', 'sent_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('whatsapp_messages');
        Schema::dropIfExists('whatsapp_conversations');
    }
};
