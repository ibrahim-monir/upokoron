<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Webhooks;

use App\Http\Controllers\Controller;
use App\Services\Support\WhatsAppService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Log;

/**
 * Where WhatsApp delivers everything customers send the shop.
 *
 * Public by necessity -- Meta's servers hold no session and no token of ours
 * -- so the signature is the only thing standing between this endpoint and
 * anyone who learns the URL posting invented messages from invented numbers.
 * It is checked before the body is looked at, and a request that fails is
 * refused without a word about why.
 */
class WhatsAppWebhookController extends Controller
{
    public function __construct(private readonly WhatsAppService $whatsapp) {}

    /**
     * Meta's one-time check that this URL is ours.
     *
     * It calls with a challenge and the verify token typed into the app
     * dashboard; echoing the challenge back as PLAIN TEXT is what completes
     * the subscription. A JSON body -- even one containing the right number
     * -- fails the check, which is a confusing half hour for anyone who has
     * not met it before.
     */
    public function verify(Request $request): Response
    {
        $token = config('services.whatsapp.verify_token');

        if (
            $request->query('hub_mode') === 'subscribe'
            && filled($token)
            && hash_equals((string) $token, (string) $request->query('hub_verify_token'))
        ) {
            return response((string) $request->query('hub_challenge'), 200)
                ->header('Content-Type', 'text/plain');
        }

        return response('', 403);
    }

    /**
     * Everything a customer sends, plus receipts for what the shop sent.
     *
     * Always answers 200, even when the payload makes no sense. Meta retries
     * anything else with growing delays and eventually disables the webhook,
     * so a message this shop cannot parse must not become a message it stops
     * receiving. What went wrong goes to the log instead.
     */
    public function receive(Request $request): JsonResponse
    {
        if (! $this->whatsapp->signatureIsValid(
            $request->getContent(),
            $request->header('X-Hub-Signature-256'),
        )) {
            Log::warning('WhatsApp webhook rejected: bad signature');

            return response()->json(['message' => 'Invalid signature.'], 403);
        }

        $this->whatsapp->ingest($request->all());

        return response()->json(['received' => true]);
    }
}
