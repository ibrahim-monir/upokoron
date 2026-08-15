<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Enums\AuditEvent;
use App\Http\Controllers\Controller;
use App\Models\User;
use App\Notifications\PasswordChanged;
use App\Services\Support\AuditService;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;
use Illuminate\Validation\ValidationException;

class PasswordController extends Controller
{
    public function __construct(private readonly AuditService $audit) {}

    /**
     * Change the password of the signed-in user.
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);

        $user = $request->user();

        if (! Hash::check($validated['current_password'], $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => 'That is not your current password.',
            ]);
        }

        $user->update(['password' => $validated['password']]);

        // Every other device is now holding a credential the owner just chose
        // to rotate away from. Revoke them.
        $user->tokens()->delete();

        $this->audit->record(AuditEvent::PasswordChanged, $user);
        $user->notify(new PasswordChanged());

        return response()->json(['message' => 'Password changed. Other devices have been signed out.']);
    }

    /**
     * Send a reset link. Password reset runs over email; accounts registered
     * with only a phone number need SMS OTP, which arrives with the
     * notifications module in Phase 12.
     */
    public function forgot(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);

        $status = Password::sendResetLink($request->only('email'));

        // Always the same response, so this endpoint cannot be used to check
        // whether an address has an account.
        return response()->json([
            'message' => 'If that address has an account, a reset link is on its way.',
            'status' => $status,
        ]);
    }

    public function reset(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'confirmed', PasswordRule::min(8)->letters()->numbers()],
        ]);

        $status = Password::reset(
            $request->only('email', 'password', 'password_confirmation', 'token'),
            function (User $user, string $password): void {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                ])->save();

                $user->tokens()->delete();

                $this->audit->record(AuditEvent::PasswordChanged, $user, null, ['via' => 'reset_link']);
                $user->notify(new PasswordChanged());

                event(new PasswordReset($user));
            }
        );

        if ($status !== Password::PasswordReset) {
            throw ValidationException::withMessages([
                'email' => 'This reset link is invalid or has expired.',
            ]);
        }

        return response()->json(['message' => 'Password reset. You can sign in now.']);
    }
}
