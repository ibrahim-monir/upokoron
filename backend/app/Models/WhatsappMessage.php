<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One message in a WhatsApp thread, in either direction.
 */
class WhatsappMessage extends Model
{
    protected $fillable = [
        'whatsapp_conversation_id',
        'wa_message_id',
        'direction',
        'type',
        'body',
        'status',
        'error',
        'sent_by',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
        ];
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(WhatsappConversation::class, 'whatsapp_conversation_id');
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sent_by');
    }

    public function isInbound(): bool
    {
        return $this->direction === 'in';
    }
}
