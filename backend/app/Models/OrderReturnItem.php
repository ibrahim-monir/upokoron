<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Quantity;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderReturnItem extends Model
{
    protected $fillable = [];

    protected function casts(): array
    {
        return [
            'quantity' => 'decimal:3',
            'restock' => 'boolean',
        ];
    }

    public function orderReturn(): BelongsTo
    {
        return $this->belongsTo(OrderReturn::class);
    }

    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }

    public function quantity(): Quantity
    {
        return Quantity::of($this->quantity);
    }
}
