<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\ContactMessage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ContactMessageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('contact.view'), 403);

        $messages = ContactMessage::query()
            ->when($request->boolean('unread_only'), fn ($q) => $q->unread())
            // Unread first, then newest: the point of the screen is what has
            // not been answered yet.
            ->orderByRaw('read_at is null desc')
            ->latest('id')
            ->paginate($request->integer('per_page', 20));

        return response()->json([
            'data' => collect($messages->items())->map(fn (ContactMessage $message) => [
                'id' => $message->id,
                'name' => $message->name,
                'email' => $message->email,
                'phone' => $message->phone,
                'subject' => $message->subject,
                'message' => $message->message,
                'is_read' => $message->isRead(),
                'created_at' => $message->created_at?->toIso8601String(),
            ]),
            'meta' => [
                'current_page' => $messages->currentPage(),
                'last_page' => $messages->lastPage(),
                'total' => $messages->total(),
            ],
            'unread' => ContactMessage::unread()->count(),
        ]);
    }

    /**
     * Mark one read, or put it back to unread.
     *
     * Reversible on purpose: "I will deal with this later" is a real answer,
     * and a one-way read flag makes people leave the screen alone instead.
     */
    public function updateStatus(Request $request, ContactMessage $message): JsonResponse
    {
        abort_unless($request->user()?->can('contact.manage'), 403);

        $validated = $request->validate([
            'is_read' => ['required', 'boolean'],
        ]);

        $message->markRead($validated['is_read']);

        return response()->json([
            'message' => $validated['is_read'] ? 'Marked as read.' : 'Marked as unread.',
        ]);
    }

    public function destroy(Request $request, ContactMessage $message): JsonResponse
    {
        abort_unless($request->user()?->can('contact.manage'), 403);

        $message->delete();

        return response()->json(['message' => 'Message deleted.']);
    }
}
