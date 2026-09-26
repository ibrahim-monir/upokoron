<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Support\SmsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Does my SMS setup work?" -- answered before a customer depends on it.
 *
 * Sent straight away rather than queued, so the owner sees the gateway's
 * own answer (bad key, no balance, sender ID not approved) on the screen.
 */
class NotificationTestController extends Controller
{
    public function sms(Request $request, SmsService $sms): JsonResponse
    {
        abort_unless($request->user()?->can('settings.manage'), 403);

        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
        ]);

        $result = $sms->send($data['phone'], 'Test message from your shop. SMS notifications are working.');

        return response()->json($result, $result['sent'] ? 200 : 422);
    }
}
