<?php

declare(strict_types=1);

namespace App\Services\Support;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Text messages through a Bangladeshi SMS gateway.
 *
 * Shaped around BulkSMSBD's API -- GET the gateway URL with api_key, type,
 * number, senderid and message -- which most local gateways copy, so
 * switching provider is usually a change of URL in settings, not of code.
 *
 * Never throws. An SMS is a courtesy; a gateway that is down or out of
 * credit must not fail the order it is about. Failures go to the log.
 */
class SmsService
{
    public function __construct(private readonly SettingsService $settings) {}

    public function isConfigured(): bool
    {
        return $this->settings->bool('sms_enabled')
            && trim((string) $this->settings->get('sms_api_key', '')) !== ''
            && trim((string) $this->settings->get('sms_api_url', '')) !== '';
    }

    /**
     * @return array{sent: bool, message: string}
     */
    public function send(string $phone, string $message): array
    {
        if (! $this->isConfigured()) {
            return ['sent' => false, 'message' => 'SMS is switched off or has no API key.'];
        }

        $number = $this->normalise($phone);

        if ($number === null) {
            return ['sent' => false, 'message' => "\"{$phone}\" is not a Bangladeshi mobile number."];
        }

        try {
            $response = Http::timeout(15)->get((string) $this->settings->get('sms_api_url'), [
                'api_key' => (string) $this->settings->get('sms_api_key'),
                'type' => 'text',
                'number' => $number,
                'senderid' => (string) $this->settings->get('sms_sender_id', ''),
                'message' => $message,
            ]);
        } catch (Throwable $e) {
            Log::warning('SMS gateway unreachable.', ['number' => $number, 'error' => $e->getMessage()]);

            return ['sent' => false, 'message' => 'Could not reach the SMS gateway: '.$e->getMessage()];
        }

        // BulkSMSBD answers 200 with its own code in the body: 202 is sent,
        // anything else is a reason (bad key, no balance, sender not
        // approved). Gateways that do not use that field are judged on the
        // HTTP status alone.
        $code = $response->json('response_code');
        $sent = $response->successful() && ($code === null || (int) $code === 202);

        if (! $sent) {
            Log::warning('SMS not sent.', [
                'number' => $number,
                'status' => $response->status(),
                'body' => mb_substr($response->body(), 0, 300),
            ]);
        }

        return [
            'sent' => $sent,
            'message' => $sent
                ? 'Sent.'
                : 'The gateway refused it: '.($response->json('error_message') ?? mb_substr($response->body(), 0, 200)),
        ];
    }

    /** 01XXXXXXXXX, +8801XXXXXXXXX or 8801XXXXXXXXX -> 8801XXXXXXXXX. */
    private function normalise(string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?? '';

        if (str_starts_with($digits, '880')) {
            $digits = substr($digits, 2);
        }

        return preg_match('/^01[3-9]\d{8}$/', $digits) === 1 ? '88'.$digits : null;
    }
}
