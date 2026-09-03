<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\QuestionStatus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductQuestion extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id', 'customer_id',
        'asker_name', 'asker_email', 'question',
        'answer', 'answered_by', 'answered_at',
        'status', 'ip_address',
    ];

    protected function casts(): array
    {
        return [
            'status' => QuestionStatus::class,
            'answered_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function answeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'answered_by');
    }

    public function scopeApproved(Builder $query): Builder
    {
        return $query->where('status', QuestionStatus::Approved->value);
    }

    public function isAnswered(): bool
    {
        return filled($this->answer);
    }
}
