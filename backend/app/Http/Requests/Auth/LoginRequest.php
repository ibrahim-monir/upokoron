<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use App\Enums\AuditEvent;
use App\Models\User;
use App\Services\Support\AuditService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // Email or phone -- one field, because asking a customer which
            // kind of identifier they used is a question they should not have
            // to answer.
            'identifier' => ['required', 'string', 'max:190'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'identifier' => trim((string) $this->input('identifier')),
        ]);
    }

    /**
     * Verify the credentials and return the user.
     *
     * Throttling is keyed on identifier AND ip together, so one attacker
     * cannot lock a legitimate customer out of their own account by burning
     * the attempt budget from somewhere else.
     */
    public function authenticateUser(AuditService $audit): User
    {
        $this->ensureIsNotRateLimited();

        $user = User::findByIdentifier($this->string('identifier')->value());

        if ($user === null || ! Hash::check($this->string('password')->value(), $user->password)) {
            RateLimiter::hit($this->throttleKey());

            if ($user !== null) {
                $audit->record(
                    AuditEvent::LoginFailed,
                    $user,
                    null,
                    ['identifier' => $this->input('identifier')],
                );
            }

            // Deliberately the same message whether the account exists or not,
            // so this endpoint cannot be used to enumerate customers.
            throw ValidationException::withMessages([
                'identifier' => 'These credentials do not match our records.',
            ]);
        }

        if (! $user->is_active) {
            RateLimiter::hit($this->throttleKey());

            throw ValidationException::withMessages([
                'identifier' => 'This account has been deactivated. Contact support.',
            ]);
        }

        RateLimiter::clear($this->throttleKey());

        return $user;
    }

    public function ensureIsNotRateLimited(): void
    {
        if (! RateLimiter::tooManyAttempts($this->throttleKey(), 5)) {
            return;
        }

        $seconds = RateLimiter::availableIn($this->throttleKey());

        throw ValidationException::withMessages([
            'identifier' => "Too many login attempts. Try again in {$seconds} seconds.",
        ]);
    }

    public function throttleKey(): string
    {
        return Str::transliterate(
            Str::lower((string) $this->input('identifier')).'|'.$this->ip()
        );
    }
}
