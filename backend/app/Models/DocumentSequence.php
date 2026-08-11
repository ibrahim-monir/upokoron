<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DocumentSequence extends Model
{
    protected $fillable = [
        'key',
        'prefix',
        'period_year',
        'period_month',
        'next_number',
        'padding',
        'reset_period',
    ];

    protected function casts(): array
    {
        return [
            'period_year' => 'integer',
            'period_month' => 'integer',
            'next_number' => 'integer',
            'padding' => 'integer',
        ];
    }
}
