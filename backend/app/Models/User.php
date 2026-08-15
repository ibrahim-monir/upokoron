<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use App\Notifications\QueuedResetPassword;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

/**
 * One users table for everybody -- staff and customers alike.
 *
 * Roles decide what a session may reach; there is no user "type" flag,
 * because a staff member being able to shop should not require a second
 * account. Admin panel access is gated by the `admin.access` permission.
 */
class User extends Authenticatable
{
    use Auditable, HasApiTokens, HasFactory, HasRoles, Notifiable, SoftDeletes;

    protected $fillable = [
        'name',
        'email',
        'phone',
        'password',
        'avatar',
        'is_active',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'phone_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'is_active' => 'boolean',
            'password' => 'hashed',
        ];
    }

    public function customer(): HasOne
    {
        return $this->hasOne(Customer::class);
    }

    /**
     * Can this user reach the admin panel at all? Individual endpoints still
     * check their own permission on top of this.
     */
    public function canAccessAdmin(): bool
    {
        return $this->is_active && $this->can('admin.access');
    }

    /**
     * Resolve a login identifier that may be either an email or a phone.
     */
    public static function findByIdentifier(string $identifier): ?self
    {
        return static::where('email', $identifier)
            ->orWhere('phone', $identifier)
            ->first();
    }

    /**
     * Overrides the default synchronous notification so a slow or failing
     * mail transport cannot turn a forgot-password request into a 500 --
     * see App\Notifications\QueuedResetPassword.
     */
    public function sendPasswordResetNotification(#[\SensitiveParameter] $token): void
    {
        $this->notify(new QueuedResetPassword($token));
    }
}
