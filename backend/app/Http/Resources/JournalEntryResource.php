<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\JournalEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin JournalEntry
 */
class JournalEntryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'entry_date' => $this->entry_date->toDateString(),
            'event' => $this->event,
            'memo' => $this->memo,
            'total_debit' => $this->total_debit,
            'total_credit' => $this->total_credit,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),

            'reference_type' => $this->when(
                $this->reference_type !== null,
                fn () => class_basename($this->reference_type),
            ),
            'reference_id' => $this->reference_id,

            'reversal_of' => $this->whenLoaded('reversalOf', fn () => $this->reversalOf?->number),
            'reversed_by' => $this->whenLoaded('reversedBy', fn () => $this->reversedBy?->number),
            'reversal_reason' => $this->reversal_reason,

            'created_by' => $this->whenLoaded('createdBy', fn () => $this->createdBy?->name),
            'posted_at' => $this->posted_at?->toIso8601String(),

            'lines' => $this->whenLoaded('lines', fn () => $this->lines->map(fn ($line) => [
                'line_no' => $line->line_no,
                'account_id' => $line->account_id,
                'account_code' => $line->account?->code,
                'account_name' => $line->account?->name,
                'debit' => $line->debit,
                'credit' => $line->credit,
                'party_type' => $line->party_type ? class_basename($line->party_type) : null,
                'party_id' => $line->party_id,
                'memo' => $line->memo,
            ])),
        ];
    }
}
