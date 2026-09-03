<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\WhatsappConversation;
use App\Models\WhatsappMessage;
use App\Services\Support\WhatsAppService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The WhatsApp inbox: staff read and answer here, the customer stays in
 * WhatsApp on their phone.
 */
class ChatController extends Controller
{
    public function __construct(private readonly WhatsAppService $whatsapp) {}

    /**
     * Every conversation, newest activity first.
     */
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('chat.view'), 403);

        $search = trim((string) $request->query('search', ''));

        $conversations = WhatsappConversation::query()
            ->with('customer')
            ->when(! $request->boolean('archived'), fn ($q) => $q->open())
            ->when($search !== '', function ($q) use ($search): void {
                $digits = preg_replace('/\D/', '', $search) ?? '';

                $q->where(function ($inner) use ($search, $digits): void {
                    $inner->where('profile_name', 'like', "%{$search}%");

                    if ($digits !== '') {
                        $inner->orWhere('wa_id', 'like', "%{$digits}%");
                    }
                });
            })
            ->orderByDesc('last_message_at')
            ->paginate($request->integer('per_page', 30));

        return response()->json([
            'data' => collect($conversations->items())
                ->map(fn (WhatsappConversation $c): array => $this->summarise($c))
                ->all(),
            'meta' => [
                'current_page' => $conversations->currentPage(),
                'last_page' => $conversations->lastPage(),
                'total' => $conversations->total(),
            ],
            // Both drive the sidebar: the badge counts threads waiting, and
            // the connection state is why the screen says "not connected yet"
            // instead of showing an empty inbox that looks broken.
            'unread' => (int) WhatsappConversation::open()->sum('unread_count'),
            'is_configured' => $this->whatsapp->isConfigured(),
        ]);
    }

    /**
     * One thread, and reading it marks it read.
     */
    public function show(Request $request, WhatsappConversation $conversation): JsonResponse
    {
        abort_unless($request->user()?->can('chat.view'), 403);

        // Opening a conversation IS reading it -- a separate "mark read"
        // button is a thing staff forget, and then the badge lies.
        if ($conversation->unread_count > 0) {
            $this->whatsapp->markRead($conversation);
            $conversation->refresh();
        }

        $conversation->load(['customer', 'messages.sender']);

        return response()->json([
            'data' => [
                ...$this->summarise($conversation),

                // Staff need to know BEFORE writing that a reply will be
                // refused, so the composer can say so instead of the send
                // failing under their hands.
                'can_reply' => $conversation->isWithinServiceWindow() && $this->whatsapp->isConfigured(),
                'window_expires_at' => $conversation->customer_last_message_at?->addDay()->toIso8601String(),

                'messages' => $conversation->messages->map(fn (WhatsappMessage $m): array => [
                    'id' => $m->id,
                    'direction' => $m->direction,
                    'type' => $m->type,
                    'body' => $m->body,
                    'status' => $m->status,
                    'error' => $m->error,
                    'sent_by' => $m->sender?->name,
                    'sent_at' => $m->sent_at?->toIso8601String(),
                ])->all(),
            ],
        ]);
    }

    /**
     * Reply as the shop.
     */
    public function reply(Request $request, WhatsappConversation $conversation): JsonResponse
    {
        abort_unless($request->user()?->can('chat.reply'), 403);

        $data = $request->validate([
            'body' => ['required', 'string', 'max:4096'],
        ]);

        $message = $this->whatsapp->send($conversation, trim($data['body']), $request->user());

        return response()->json([
            'message' => 'Sent.',
            'data' => [
                'id' => $message->id,
                'direction' => $message->direction,
                'body' => $message->body,
                'status' => $message->status,
                'sent_by' => $request->user()?->name,
                'sent_at' => $message->sent_at?->toIso8601String(),
            ],
        ], 201);
    }

    /**
     * Out of the inbox, without losing what was said.
     *
     * Archiving rather than deleting, and reversible: a customer who writes
     * again reopens the thread by itself (see WhatsAppService), because an
     * archived conversation holding an unanswered question is how people end
     * up ignored.
     */
    public function archive(Request $request, WhatsappConversation $conversation): JsonResponse
    {
        abort_unless($request->user()?->can('chat.reply'), 403);

        $data = $request->validate([
            'archived' => ['required', 'boolean'],
        ]);

        $conversation->forceFill([
            'archived_at' => $data['archived'] ? now() : null,
        ])->save();

        return response()->json([
            'message' => $data['archived'] ? 'Conversation archived.' : 'Conversation reopened.',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function summarise(WhatsappConversation $conversation): array
    {
        return [
            'id' => $conversation->id,
            'wa_id' => $conversation->wa_id,
            'number' => $conversation->displayNumber(),
            'name' => $conversation->profile_name ?? $conversation->customer?->name,
            'customer' => $conversation->customer === null ? null : [
                'id' => $conversation->customer->id,
                'name' => $conversation->customer->name,
            ],
            'unread_count' => $conversation->unread_count,
            'is_archived' => $conversation->archived_at !== null,
            'last_message_at' => $conversation->last_message_at?->toIso8601String(),
        ];
    }
}
