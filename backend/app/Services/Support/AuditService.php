<?php

declare(strict_types=1);

namespace App\Services\Support;

use App\Enums\AuditEvent;
use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Request;

class AuditService
{
    /**
     * Write one audit row.
     *
     * Requests coming from the console or the scheduler have no authenticated
     * user and no request context; those fields stay null rather than being
     * faked, so "who did this" is either a real answer or an honest blank.
     *
     * @param  array<string, mixed>|null  $oldValues
     * @param  array<string, mixed>|null  $newValues
     * @param  array<int, string>  $tags
     */
    public function record(
        AuditEvent $event,
        ?Model $auditable = null,
        ?array $oldValues = null,
        ?array $newValues = null,
        array $tags = [],
        ?string $auditableType = null,
        int|string|null $auditableId = null,
    ): ?AuditLog {
        if (! config('upokoron.audit.enabled', true)) {
            return null;
        }

        $type = $auditableType ?? ($auditable ? $auditable->getMorphClass() : null);
        $id = $auditableId ?? $auditable?->getKey();

        if ($type === null || $id === null) {
            return null;
        }

        if ($auditable !== null && method_exists($auditable, 'auditTags')) {
            $tags = array_merge($auditable->auditTags(), $tags);
        }

        return AuditLog::create([
            'user_id' => Auth::id(),
            'event' => $event,
            'auditable_type' => $type,
            'auditable_id' => $id,
            'old_values' => $oldValues ?: null,
            'new_values' => $newValues ?: null,
            'url' => $this->currentUrl(),
            'ip_address' => Request::ip(),
            'user_agent' => substr((string) Request::userAgent(), 0, 500) ?: null,
            'tags' => $tags ?: null,
        ]);
    }

    /**
     * Record an event that is not tied to an Eloquent change -- a login, a
     * failed login, an export. These attach to the acting user.
     *
     * @param  array<string, mixed>|null  $context
     */
    public function log(AuditEvent $event, Model $subject, ?array $context = null, array $tags = []): ?AuditLog
    {
        return $this->record($event, $subject, null, $context, $tags);
    }

    private function currentUrl(): ?string
    {
        if (app()->runningInConsole()) {
            return null;
        }

        return substr(Request::fullUrl(), 0, 255);
    }
}
