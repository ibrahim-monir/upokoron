<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DropShippingImportRun extends Model
{
    protected $table = 'dropshipping_import_runs';

    protected $fillable = [
        'provider', 'status', 'trigger', 'page_from', 'page_to', 'category_id', 'source_index', 'source_count',
        'current_page', 'last_page', 'created_count', 'updated_count', 'hidden_count', 'seen_count', 'total_count',
        'skipped_count', 'failed_count', 'error', 'started_by', 'started_at', 'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'current_page' => 'integer',
            'last_page' => 'integer',
            'page_from' => 'integer',
            'page_to' => 'integer',
            'source_index' => 'integer',
            'source_count' => 'integer',
            'created_count' => 'integer',
            'updated_count' => 'integer',
            'hidden_count' => 'integer',
            'seen_count' => 'integer',
            'total_count' => 'integer',
            'skipped_count' => 'integer',
            'failed_count' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function isActive(): bool
    {
        return in_array($this->status, ['queued', 'running'], true);
    }
}
