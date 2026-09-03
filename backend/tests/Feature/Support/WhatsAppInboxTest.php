<?php

declare(strict_types=1);

namespace Tests\Feature\Support;

use App\Models\Customer;
use App\Models\WhatsappConversation;
use App\Models\WhatsappMessage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The WhatsApp support inbox.
 *
 * Two things carry the weight here. The webhook is a PUBLIC endpoint whose
 * only defence is the signature, so a forged post must not be able to put
 * words in a customer's mouth. And Meta retries every webhook until it is
 * acknowledged, so the same message arrives more than once as a matter of
 * course -- a thread that doubles under retry is not a rare bug, it is the
 * normal case.
 */
class WhatsAppInboxTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-app-secret';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.whatsapp.app_secret' => self::SECRET,
            'services.whatsapp.verify_token' => 'test-verify-token',
            'services.whatsapp.phone_number_id' => '123456',
            'services.whatsapp.token' => 'test-token',
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function postWebhook(array $payload, bool $sign = true): \Illuminate\Testing\TestResponse
    {
        $body = json_encode($payload, JSON_THROW_ON_ERROR);

        return $this->call(
            'POST',
            '/api/v1/webhooks/whatsapp',
            server: [
                'CONTENT_TYPE' => 'application/json',
                'HTTP_X_HUB_SIGNATURE_256' => $sign
                    ? 'sha256='.hash_hmac('sha256', $body, self::SECRET)
                    : 'sha256=forged',
            ],
            content: $body,
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function inboundPayload(string $id = 'wamid.1', string $text = 'Is this in stock?'): array
    {
        return [
            'entry' => [[
                'changes' => [[
                    'value' => [
                        'contacts' => [['wa_id' => '8801712345678', 'profile' => ['name' => 'Rahim']]],
                        'messages' => [[
                            'from' => '8801712345678',
                            'id' => $id,
                            'timestamp' => (string) now()->getTimestamp(),
                            'type' => 'text',
                            'text' => ['body' => $text],
                        ]],
                    ],
                ]],
            ]],
        ];
    }

    public function test_meta_can_verify_the_webhook_url(): void
    {
        $this->get('/api/v1/webhooks/whatsapp?hub_mode=subscribe&hub_verify_token=test-verify-token&hub_challenge=42')
            ->assertOk()
            // Plain text, not JSON: a JSON body fails Meta's check even when
            // it contains the right number.
            ->assertSee('42');

        $this->get('/api/v1/webhooks/whatsapp?hub_mode=subscribe&hub_verify_token=wrong&hub_challenge=42')
            ->assertForbidden();
    }

    public function test_a_forged_webhook_cannot_put_words_in_a_customers_mouth(): void
    {
        $this->postWebhook($this->inboundPayload(), sign: false)->assertForbidden();

        $this->assertDatabaseCount('whatsapp_conversations', 0);
        $this->assertDatabaseCount('whatsapp_messages', 0);
    }

    public function test_an_incoming_message_opens_a_thread(): void
    {
        $this->postWebhook($this->inboundPayload())->assertOk();

        $conversation = WhatsappConversation::sole();

        $this->assertSame('8801712345678', $conversation->wa_id);
        $this->assertSame('Rahim', $conversation->profile_name);
        $this->assertSame(1, $conversation->unread_count);
        $this->assertTrue($conversation->isWithinServiceWindow());

        $this->assertSame('Is this in stock?', $conversation->messages()->sole()->body);
    }

    public function test_a_retried_webhook_does_not_double_the_thread(): void
    {
        $this->postWebhook($this->inboundPayload())->assertOk();
        $this->postWebhook($this->inboundPayload())->assertOk();

        $this->assertDatabaseCount('whatsapp_messages', 1);
        $this->assertSame(1, WhatsappConversation::sole()->unread_count);
    }

    public function test_a_thread_is_matched_to_the_account_with_that_number(): void
    {
        $customer = Customer::factory()->create(['phone' => '01712345678']);

        $this->postWebhook($this->inboundPayload())->assertOk();

        $this->assertSame($customer->id, WhatsappConversation::sole()->customer_id);
    }

    public function test_delivery_receipts_land_on_the_message_they_belong_to(): void
    {
        $this->postWebhook($this->inboundPayload())->assertOk();

        $conversation = WhatsappConversation::sole();

        $sent = $conversation->messages()->create([
            'wa_message_id' => 'wamid.out.1',
            'direction' => 'out',
            'type' => 'text',
            'body' => 'Yes, in stock.',
            'status' => 'sent',
            'sent_at' => now(),
        ]);

        $this->postWebhook([
            'entry' => [[
                'changes' => [[
                    'value' => ['statuses' => [['id' => 'wamid.out.1', 'status' => 'read']]],
                ]],
            ]],
        ])->assertOk();

        $this->assertSame('read', $sent->refresh()->status);
    }

    public function test_staff_read_the_inbox_and_opening_a_thread_clears_its_badge(): void
    {
        Http::fake();

        $this->postWebhook($this->inboundPayload())->assertOk();

        $this->actingAsRole('support');

        $this->getJson('/api/v1/admin/chat/conversations')
            ->assertOk()
            ->assertJsonPath('unread', 1)
            ->assertJsonPath('data.0.name', 'Rahim');

        $conversation = WhatsappConversation::sole();

        $this->getJson("/api/v1/admin/chat/conversations/{$conversation->id}")
            ->assertOk()
            ->assertJsonPath('data.can_reply', true)
            ->assertJsonPath('data.messages.0.body', 'Is this in stock?');

        $this->assertSame(0, $conversation->refresh()->unread_count);
    }

    public function test_a_reply_is_sent_to_whatsapp_and_kept_in_the_thread(): void
    {
        Http::fake([
            'graph.facebook.com/*' => Http::response(['messages' => [['id' => 'wamid.out.9']]]),
        ]);

        $this->postWebhook($this->inboundPayload())->assertOk();

        $conversation = WhatsappConversation::sole();

        $this->actingAsRole('support');

        $this->postJson("/api/v1/admin/chat/conversations/{$conversation->id}/messages", [
            'body' => 'Yes, we have it in Dhaka.',
        ])->assertCreated();

        $reply = WhatsappMessage::where('direction', 'out')->sole();

        $this->assertSame('wamid.out.9', $reply->wa_message_id);
        $this->assertSame('Yes, we have it in Dhaka.', $reply->body);
        $this->assertNotNull($reply->sent_by);
    }

    /**
     * The rule that costs money to learn in production: 24 hours after the
     * customer's last message, WhatsApp accepts only approved templates.
     */
    public function test_a_reply_outside_the_24_hour_window_is_refused_before_it_is_sent(): void
    {
        Http::fake();

        $this->postWebhook($this->inboundPayload())->assertOk();

        $conversation = WhatsappConversation::sole();
        $conversation->forceFill(['customer_last_message_at' => now()->subDays(2)])->save();

        $this->actingAsRole('support');

        $this->getJson("/api/v1/admin/chat/conversations/{$conversation->id}")
            ->assertOk()
            ->assertJsonPath('data.can_reply', false);

        $this->postJson("/api/v1/admin/chat/conversations/{$conversation->id}/messages", [
            'body' => 'Are you still there?',
        ])->assertStatus(409)
            ->assertJsonPath('code', 'whatsapp_outside_service_window');

        // Not assertNothingSent: opening the thread above sends a read
        // receipt, which is a different call and a perfectly good one. What
        // must not have happened is a message.
        Http::assertNotSent(fn ($request): bool => ($request['type'] ?? null) === 'text');

        $this->assertDatabaseMissing('whatsapp_messages', ['direction' => 'out']);
    }

    public function test_a_role_without_the_permission_cannot_read_the_inbox(): void
    {
        $this->actingAsRole('accountant');

        $this->getJson('/api/v1/admin/chat/conversations')->assertForbidden();
    }
}
