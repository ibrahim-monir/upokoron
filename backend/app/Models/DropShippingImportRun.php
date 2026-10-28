<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DropShippingImportRun extends Model
{
    protected $fillable = [
        'status', 'page_from', 'page_to', 'category_id', 'current_page', 'last_page', 'created_count', 'skipped_count',
        'failed_count', 'error', 'started_by', 'started_at', 'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'current_page' => 'integer',
            'last_page' => 'integer',
            'page_from' => 'integer',
            'page_to' => 'integer',
            'created_count' => 'integer',
            'skipped_count' => 'integer',
            'failed_count' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }
}
