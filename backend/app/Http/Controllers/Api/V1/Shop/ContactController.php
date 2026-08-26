<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Controller;
use App\Models\ContactMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContactController extends Controller
{
    /**
     * Take a message from the contact page.
     *
     * Open to anyone, so it is rate limited at the route and the fields are
     * bounded here. Nothing is emailed: the row is the record, and the owner
     * reads it in the panel (see the migration for why).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'email' => ['nullable', 'email:rfc', 'max:190'],
            'phone' => ['nullable', 'string', 'regex:/^01[3-9]\d{8}$/'],
            'subject' => ['nullable', 'string', 'max:160'],
            'message' => ['required', 'string', 'min:10', 'max:5000'],
        ]);

        // One of the two, or there is no way to answer. Checked here rather
        // than with required_without so the message lands on both fields.
        if (blank($validated['email'] ?? null) && blank($validated['phone'] ?? null)) {
            return response()->json([
                'message' => 'Leave a mobile number or an email address so we can reply.',
                'errors' => [
                    'email' => ['Leave a mobile number or an email address so we can reply.'],
                    'phone' => ['Leave a mobile number or an email address so we can reply.'],
                ],
            ], 422);
        }

        ContactMessage::create($validated + ['ip_address' => $request->ip()]);

        return response()->json([
            'message' => 'Thank you — your message has reached us. We will get back to you soon.',
        ], 201);
    }
}
