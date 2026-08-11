<?php

declare(strict_types=1);

namespace App\Exceptions;

/**
 * This business event has already been posted for this document.
 *
 * Reaching this means a retry or a double submission got past the calling
 * service's own state checks. The database refused it, which is the point of
 * the unique index -- but the caller should usually have caught it earlier,
 * so it is worth investigating rather than swallowing.
 *
 * Callers that expect retries (payment gateway webhooks) should use
 * JournalService::postOnce() instead, which returns the existing entry.
 */
class DuplicateJournalEntryException extends BusinessRuleException
{
    public static function make(string $event, ?string $referenceType, int|string|null $referenceId): self
    {
        return new self(
            sprintf(
                'Event [%s] has already been posted for %s#%s.',
                $event,
                class_basename($referenceType ?? 'manual'),
                $referenceId ?? '-',
            ),
            'duplicate_journal_entry',
            ['event' => $event, 'reference_type' => $referenceType, 'reference_id' => $referenceId],
        );
    }
}
