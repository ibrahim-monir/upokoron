<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class ContactMessage extends Model
{
    protected $fillable = [
        'name',
        'email',
        'phone',
        'subject',
        'message',
        'ip_address',
    ];

    protected function casts(): array
    {
        return [
            'read_at' => 'datetime',
        ];
    }

    public function isRead(): bool
    {
        return $this->read_at !== null;
    }

    /**
     * Deliberately not a fillable column.
     *
     * When a message was read is something the server stamps, never
     * something a request supplies, so it is set here rather than left
     * mass-assignable alongside the fields the public form fills in.
     */
    public function markRead(bool $read): void
    {
        $this->read_at = $read ? now() : null;
        $this->save();
    }

    public function scopeUnread(Builder $query): Builder
    {
        return $query->whereNull('read_at');
    }
}
