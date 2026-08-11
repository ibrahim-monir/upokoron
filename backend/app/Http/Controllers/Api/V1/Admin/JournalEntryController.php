<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreJournalEntryRequest;
use App\Http\Resources\JournalEntryResource;
use App\Models\JournalEntry;
use App\Services\Accounting\JournalLine;
use App\Services\Accounting\JournalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class JournalEntryController extends Controller
{
    public function __construct(private readonly JournalService $journal) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()?->can('accounting.view'), 403);

        $entries = JournalEntry::with('lines.account:id,code,name', 'createdBy:id,name')
            ->when($request->filled('event'), fn ($q) => $q->where('event', 'like', $request->string('event')->value().'%'))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')->value()))
            ->when($request->filled('account_id'), fn ($q) => $q->whereHas(
                'lines',
                fn ($l) => $l->where('account_id', $request->integer('account_id'))
            ))
            ->between($request->input('from'), $request->input('to'))
            ->orderByDesc('entry_date')
            ->orderByDesc('id')
            ->paginate($request->integer('per_page', 25));

        return JournalEntryResource::collection($entries);
    }

    public function show(Request $request, JournalEntry $journalEntry): JournalEntryResource
    {
        abort_unless($request->user()?->can('accounting.view'), 403);

        return new JournalEntryResource(
            $journalEntry->load('lines.account:id,code,name', 'createdBy:id,name', 'reversedBy:id,number', 'reversalOf:id,number')
        );
    }

    /**
     * A manual journal entry, posted by the accountant.
     *
     * Manual entries carry no source document, so the event is namespaced
     * `manual.` -- see JournalService for why that distinction matters to
     * idempotency.
     */
    public function store(StoreJournalEntryRequest $request): JsonResponse
    {
        abort_unless($request->user()?->can('accounting.post'), 403);

        $lines = [];

        foreach ($request->validated('lines') as $line) {
            $lines[] = ($line['type'] ?? 'debit') === 'debit'
                ? JournalLine::debit((int) $line['account_id'], $line['amount'], memo: $line['memo'] ?? null)
                : JournalLine::credit((int) $line['account_id'], $line['amount'], memo: $line['memo'] ?? null);
        }

        $entry = $this->journal->post(
            'manual.'.$request->string('event', 'entry')->value(),
            $lines,
            $request->input('entry_date'),
            memo: $request->input('memo'),
        );

        return response()->json([
            'message' => "Journal entry {$entry->number} posted.",
            'entry' => new JournalEntryResource($entry),
        ], 201);
    }

    public function reverse(Request $request, JournalEntry $journalEntry): JsonResponse
    {
        abort_unless($request->user()?->can('accounting.reverse'), 403);

        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
            'entry_date' => ['nullable', 'date'],
        ]);

        $reversal = $this->journal->reverse(
            $journalEntry,
            $validated['reason'],
            $validated['entry_date'] ?? null,
        );

        return response()->json([
            'message' => "Entry {$journalEntry->number} reversed by {$reversal->number}.",
            'entry' => new JournalEntryResource($reversal),
        ]);
    }
}
