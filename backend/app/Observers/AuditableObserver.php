<?php

declare(strict_types=1);

namespace App\Observers;

use App\Enums\AuditEvent;
use App\Services\Support\AuditService;
use Illuminate\Database\Eloquent\Model;

class AuditableObserver
{
    public function __construct(private readonly AuditService $audit) {}

    public function created(Model $model): void
    {
        $this->audit->record(
            AuditEvent::Created,
            $model,
            null,
            $this->filter($model, $model->getAttributes()),
        );
    }

    public function updated(Model $model): void
    {
        $changes = $this->filter($model, $model->getChanges());

        // An update that only touched excluded attributes (updated_at, a
        // rehashed password) is not worth a row.
        if ($changes === []) {
            return;
        }

        $original = array_intersect_key($model->getOriginal(), $changes);

        $this->audit->record(AuditEvent::Updated, $model, $original, $changes);
    }

    public function deleted(Model $model): void
    {
        $forced = method_exists($model, 'isForceDeleting') && $model->isForceDeleting();

        $this->audit->record(
            AuditEvent::Deleted,
            $model,
            $this->filter($model, $model->getOriginal()),
            null,
            $forced ? ['force_deleted'] : [],
        );
    }

    public function restored(Model $model): void
    {
        $this->audit->record(AuditEvent::Restored, $model, null, null);
    }

    /**
     * Strip attributes the model declared as never-audit (passwords, tokens).
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    private function filter(Model $model, array $attributes): array
    {
        $exclude = method_exists($model, 'auditExclude') ? $model->auditExclude() : [];

        return array_diff_key($attributes, array_flip($exclude));
    }
}
