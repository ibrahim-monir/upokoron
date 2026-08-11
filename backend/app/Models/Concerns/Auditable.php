<?php

declare(strict_types=1);

namespace App\Models\Concerns;

use App\Models\AuditLog;
use App\Observers\AuditableObserver;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * Opt a model into automatic audit logging.
 *
 * Attach this to anything that touches money, stock, permissions, or
 * identity. Attributes listed in `auditExclude()` are never written to the
 * log -- passwords and tokens must not end up in an audit row.
 */
trait Auditable
{
    /**
     * Register the audit listeners.
     *
     * Note this does NOT use `static::observe()`. That helper does `new static`
     * internally, and calling it from a trait boot method re-enters the very
     * boot that is already running -- Laravel detects the recursion and throws.
     * Registering the events directly avoids constructing the model at all.
     */
    public static function bootAuditable(): void
    {
        foreach (['created', 'updated', 'deleted', 'restored'] as $event) {
            static::registerModelEvent($event, function ($model) use ($event): void {
                app(AuditableObserver::class)->{$event}($model);
            });
        }
    }

    public function auditLogs(): MorphMany
    {
        return $this->morphMany(AuditLog::class, 'auditable');
    }

    /**
     * Attributes that must never be recorded in the audit trail.
     *
     * @return array<int, string>
     */
    public function auditExclude(): array
    {
        return array_merge(
            config('upokoron.audit.ignore_attributes', []),
            $this->auditExcludeAdditional ?? [],
        );
    }

    /**
     * Free-form tags stored with the log row, useful for filtering later.
     *
     * @return array<int, string>
     */
    public function auditTags(): array
    {
        return [];
    }
}
