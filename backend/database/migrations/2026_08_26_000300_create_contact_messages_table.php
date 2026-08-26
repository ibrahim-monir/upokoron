<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Messages sent from the contact page.
 *
 * Stored rather than emailed. Mail is one configuration mistake away from
 * silently dropping every enquiry a shop receives, and on shared hosting
 * that mistake is common -- a row in a table cannot go missing the same
 * way. The owner reads them in the admin panel; email, when it is set up,
 * becomes a notification on top of a record that already exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('contact_messages', function (Blueprint $table): void {
            $table->id();

            $table->string('name', 120);

            // Both optional individually, but the request insists on at
            // least one -- a message nobody can reply to is not an enquiry.
            $table->string('email', 190)->nullable();
            $table->string('phone', 20)->nullable();

            $table->string('subject', 160)->nullable();
            $table->text('message');

            $table->timestamp('read_at')->nullable();

            // Kept for blocking a source that turns abusive. Not shown in
            // the panel: it identifies a person, and reading an enquiry does
            // not need it.
            $table->string('ip_address', 45)->nullable();

            $table->timestamps();

            // The inbox is read newest first, and unread first within that.
            $table->index(['read_at', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('contact_messages');
    }
};
