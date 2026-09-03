<?php

declare(strict_types=1);

namespace App\Services\Support;

use App\Exceptions\BusinessRuleException;
use App\Models\Customer;
use App\Models\User;
use App\Models\WhatsappConversation;
use App\Models\WhatsappMessage;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * The WhatsApp Business Cloud API, in both directions.
 *
 * Inbound: Meta posts a webhook for every message a customer sends, once,
 * with retries until the request is acknowledged. There is no endpoint to
 * fetch a conversation afterwards, so anything not written down when the
 * webhook arrives is gone. That shapes the whole class -- receive, store,
 * answer 200, and never let a parsing problem in one message throw away the
 * batch it arrived in.
 *
 * Outbound: a plain HTTP call, with one rule that is easy to miss and
 * expensive to discover in production. A business may send whatever it likes
 * for 24 hours after the customer's last message; outside that window only
 * pre-approved templates go through. Checked here so staff learn it from a
 * readable message rather than from a rejected send.
 */
class WhatsAppService
{
    /** Is the Cloud API configured at all? */
    public function isConfigured(): bool
    {
        return filled(config('services.whatsapp.phone_number_id'))
            && filled(config('services.whatsapp.token'));
    }

    /**
     * Is this webhook really from Meta?
     *
     * The signature is over the RAW body, byte for byte -- re-encoding the
     * decoded JSON produces a different string and a signature that never
     * matches. hash_equals rather than ===, so the comparison does not leak
     * how much of the digest was right through how long it took.
     */
    public function signatureIsValid(string $rawBody, ?string $header): bool
    {
        $secret = config('services.whatsapp.app_secret');

        // No secret configured means no way to tell a real webhook from an
        // invented one. Refuse rather than accept everything: an open inbox
        // endpoint lets anyone post messages as any customer.
        if (blank($secret) || blank($header)) {
            return false;
        }

        $expected = 'sha256='.hash_hmac('sha256', $rawBody, (string) $secret);

        return hash_equals($expected, $header);
    }

    /**
     * Store everything a webhook payload carries.
     *
     * Each entry is handled on its own and a failure is logged rather than
     * thrown: one malformed change must not cost the shop the other messages
     * delivered alongside it, and a webhook that 500s is retried forever.
     *
     * @param  array<string, mixed>  $payload
     */
    public function ingest(array $payload): void
    {
        foreach ($payload['entry'] ?? [] as $entry) {
            foreach ($entry['changes'] ?? [] as $change) {
                try {
                    $this->ingestChange($change['value'] ?? []);
                } catch (\Throwable $e) {
                    Log::error('WhatsApp webhook change failed', [
                        'error' => $e->getMessage(),
                        'value' => $change['value'] ?? null,
                    ]);
                }
            }
        }
    }

    /**
     * Send a message from the shop, and record it.
     */
    public function send(WhatsappConversation $conversation, string $body, ?User $by = null): WhatsappMessage
    {
        if (! $this->isConfigured()) {
            throw new BusinessRuleException(
                'WhatsApp is not connected yet. Add the Cloud API credentials to the environment first.',
                'whatsapp_not_configured',
            );
        }

        if (! $conversation->isWithinServiceWindow()) {
            throw new BusinessRuleException(
                'WhatsApp only allows a free reply within 24 hours of the customer\'s last message. '.
                'This conversation is outside that window, so they will have to write again first.',
                'whatsapp_outside_service_window',
            );
        }

        $response = Http::withToken((string) config('services.whatsapp.token'))
            ->asJson()
            ->post($this->endpoint('messages'), [
                'messaging_product' => 'whatsapp',
                'recipient_type' => 'individual',
                'to' => $conversation->wa_id,
                'type' => 'text',
                'text' => ['preview_url' => true, 'body' => $body],
            ]);

        if ($response->failed()) {
            // Meta's own wording is more use to whoever has to fix it than
            // anything this class could invent about "an API error".
            $message = $response->json('error.message') ?? 'WhatsApp refused the message.';

            Log::error('WhatsApp send failed', [
                'conversation' => $conversation->id,
                'status' => $response->status(),
                'body' => $response->json(),
            ]);

            throw new BusinessRuleException($message, 'whatsapp_send_failed');
        }

        $message = $conversation->messages()->create([
            'wa_message_id' => $response->json('messages.0.id'),
            'direction' => 'out',
            'type' => 'text',
            'body' => $body,
            'status' => 'sent',
            'sent_by' => $by?->getKey(),
            'sent_at' => now(),
        ]);

        $conversation->forceFill(['last_message_at' => $message->sent_at])->save();

        return $message;
    }

    /**
     * Mark the customer's messages read, both here and on their phone.
     *
     * The blue ticks are a courtesy the shop can afford: someone who can see
     * their question was opened does not send it again three times. A failure
     * to reach Meta is swallowed -- the inbox is still read locally, and no
     * one should be shown an error because a read receipt did not land.
     */
    public function markRead(WhatsappConversation $conversation): void
    {
        $conversation->forceFill(['unread_count' => 0])->save();

        if (! $this->isConfigured()) {
            return;
        }

        $lastInbound = $conversation->messages()
            ->where('direction', 'in')
            ->whereNotNull('wa_message_id')
            ->latest('sent_at')
            ->first();

        if ($lastInbound === null) {
            return;
        }

        try {
            Http::withToken((string) config('services.whatsapp.token'))
                ->asJson()
                ->post($this->endpoint('messages'), [
                    'messaging_product' => 'whatsapp',
                    'status' => 'read',
                    'message_id' => $lastInbound->wa_message_id,
                ]);
        } catch (\Throwable $e) {
            Log::warning('WhatsApp read receipt failed', ['error' => $e->getMessage()]);
        }
    }

    /**
     * One `changes[].value` block: incoming messages, and status updates for
     * messages the shop sent earlier.
     *
     * @param  array<string, mixed>  $value
     */
    private function ingestChange(array $value): void
    {
        foreach ($value['messages'] ?? [] as $incoming) {
            $this->storeIncoming($incoming, $value['contacts'] ?? []);
        }

        foreach ($value['statuses'] ?? [] as $status) {
            $this->applyStatus($status);
        }
    }

    /**
     * @param  array<string, mixed>  $incoming
     * @param  array<int, array<string, mixed>>  $contacts
     */
    private function storeIncoming(array $incoming, array $contacts): void
    {
        $waId = (string) ($incoming['from'] ?? '');

        if ($waId === '') {
            return;
        }

        $profileName = null;

        foreach ($contacts as $contact) {
            if (($contact['wa_id'] ?? null) === $waId) {
                $profileName = $contact['profile']['name'] ?? null;
            }
        }

        $sentAt = isset($incoming['timestamp'])
            ? Carbon::createFromTimestamp((int) $incoming['timestamp'])
            : now();

        DB::transaction(function () use ($incoming, $waId, $profileName, $sentAt): void {
            $conversation = $this->conversationFor($waId, $profileName);

            $message = WhatsappMessage::firstOrCreate(
                ['wa_message_id' => $incoming['id'] ?? null],
                [
                    'whatsapp_conversation_id' => $conversation->id,
                    'direction' => 'in',
                    'type' => (string) ($incoming['type'] ?? 'text'),
                    'body' => $this->readableBody($incoming),
                    'status' => 'received',
                    'sent_at' => $sentAt,
                ],
            );

            // A retry of a webhook already handled: the row was found, not
            // made, so the thread must not be counted or bumped again.
            if (! $message->wasRecentlyCreated) {
                return;
            }

            $conversation->forceFill([
                'last_message_at' => $sentAt,
                'customer_last_message_at' => $sentAt,
                'unread_count' => $conversation->unread_count + 1,
                // A customer writing again reopens the thread: an archived
                // conversation with an unanswered question in it is how
                // people end up ignored.
                'archived_at' => null,
            ])->save();
        });
    }

    /**
     * Everything WhatsApp can deliver, as something a person can read.
     *
     * Media is described rather than fetched. The Cloud API hands out media
     * ids whose download URLs expire, so storing "a photo" and its caption is
     * honest; storing a link that will 404 next week is not.
     *
     * @param  array<string, mixed>  $incoming
     */
    private function readableBody(array $incoming): ?string
    {
        $type = (string) ($incoming['type'] ?? 'text');

        return match ($type) {
            'text' => $incoming['text']['body'] ?? null,
            'button' => $incoming['button']['text'] ?? null,
            'interactive' => $incoming['interactive']['button_reply']['title']
                ?? $incoming['interactive']['list_reply']['title']
                ?? null,
            'location' => trim(sprintf(
                '%s %s',
                $incoming['location']['name'] ?? 'Location',
                $incoming['location']['address'] ?? '',
            )),
            'image', 'video', 'audio', 'document', 'sticker' => trim(sprintf(
                '[%s] %s',
                $type,
                $incoming[$type]['caption'] ?? $incoming[$type]['filename'] ?? '',
            )),
            default => "[{$type}]",
        };
    }

    /**
     * Delivery and read receipts for messages the shop sent.
     *
     * @param  array<string, mixed>  $status
     */
    private function applyStatus(array $status): void
    {
        $id = $status['id'] ?? null;

        if ($id === null) {
            return;
        }

        $message = WhatsappMessage::where('wa_message_id', $id)->first();

        if ($message === null) {
            return;
        }

        $message->forceFill([
            'status' => (string) ($status['status'] ?? $message->status),
            'error' => $status['errors'][0]['title'] ?? null,
        ])->save();
    }

    /**
     * The thread for a number, made if this is the first anyone has heard
     * from them, and matched to a customer account when one shares the number.
     */
    private function conversationFor(string $waId, ?string $profileName): WhatsappConversation
    {
        $conversation = WhatsappConversation::firstOrNew(['wa_id' => $waId]);

        if ($profileName !== null) {
            $conversation->profile_name = $profileName;
        }

        if ($conversation->customer_id === null) {
            $conversation->customer_id = $this->customerFor($waId)?->id;
        }

        $conversation->save();

        return $conversation;
    }

    /**
     * The account behind a WhatsApp number, if there is one.
     *
     * Matched on the last ten digits, from the right: a customer who
     * registered as 01712345678 and writes from 8801712345678 is one person,
     * and an inbox that cannot see that makes staff look up every enquiry by
     * hand.
     */
    private function customerFor(string $waId): ?Customer
    {
        $tail = substr(preg_replace('/\D/', '', $waId) ?? '', -10);

        if (strlen($tail) < 10) {
            return null;
        }

        return Customer::whereRaw(
            "REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?",
            ["%{$tail}"],
        )->first();
    }

    private function endpoint(string $path): string
    {
        $version = config('services.whatsapp.api_version', 'v21.0');
        $phoneNumberId = config('services.whatsapp.phone_number_id');

        return "https://graph.facebook.com/{$version}/{$phoneNumberId}/{$path}";
    }
}
