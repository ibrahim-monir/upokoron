<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One customer's WhatsApp thread with the shop, keyed on their number.
 */
class WhatsappConversation extends Model
{
    protected $fillable = ['wa_id', 'profile_name', 'customer_id'];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
            'customer_last_message_at' => 'datetime',
            'archived_at' => 'datetime',
        ];
    }

    public function messages(): HasMany
    {
        return $this->hasMany(WhatsappMessage::class)->orderBy('sent_at')->orderBy('id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function scopeOpen(Builder $query): Builder
    {
        return $query->whereNull('archived_at');
    }

    /**
     * May the shop write a message of its own choosing right now?
     *
     * WhatsApp's customer service window: free-form replies are allowed for
     * 24 hours after the customer's last message, and outside it a business
     * may send only pre-approved templates. Enforced here rather than left
     * to Meta's error response, so staff are told before they type a reply
     * rather than after.
     */
    public function isWithinServiceWindow(): bool
    {
        return $this->customer_last_message_at !== null
            && $this->customer_last_message_at->gt(now()->subDay());
    }

    /** The number in the +8801… form a person recognises. */
    public function displayNumber(): string
    {
        return '+'.$this->wa_id;
    }
}
