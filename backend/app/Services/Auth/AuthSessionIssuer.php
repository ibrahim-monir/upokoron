<?php

declare(strict_types=1);

namespace App\Services\Auth;

use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Issues authentication in whichever of the two modes the caller needs.
 *
 * The React SPA is served from the same origin as the API, so it uses a
 * session cookie -- HttpOnly, CSRF-protected, and unreachable from JavaScript,
 * which means an XSS bug cannot walk away with a long-lived credential.
 *
 * A caller that sends `device_name` (a future mobile app, an integration)
 * gets a Sanctum bearer token instead, since cookies are not workable there.
 */
class AuthSessionIssuer
{
    /**
     * Ability carried by tokens belonging to accounts with no admin
     * permissions. Never `*` -- a storefront token that can do anything is
     * exactly the credential an attacker wants.
     */
    public const STOREFRONT_ABILITY = 'storefront';

    /**
     * @return array<string, mixed>
     */
    public function issue(Request $request, User $user, bool $remember = false): array
    {
        $user->forceFill([
            'last_login_at' => now(),
            'last_login_ip' => $request->ip(),
        ])->saveQuietly();

        $user->load('roles.permissions', 'permissions', 'customer');

        $payload = ['user' => new UserResource($user)];

        if ($this->wantsToken($request)) {
            $payload['token'] = $user->createToken(
                $request->string('device_name')->value() ?: 'api',
                $this->abilitiesFor($user),
            )->plainTextToken;

            $payload['token_type'] = 'Bearer';

            // Token mode never populates the auth guard, so anything audited
            // later in this request would be attributed to nobody. The caller
            // IS this user from here on -- say so.
            Auth::setUser($user);

            return $payload;
        }

        Auth::guard('web')->login($user, $remember);
        $request->session()->regenerate();

        return $payload;
    }

    /**
     * Tear down whichever credential the request arrived with.
     */
    public function revoke(Request $request): void
    {
        $token = $request->user()?->currentAccessToken();

        // A session-authenticated request carries a TransientToken here, which
        // is not a database row and has nothing to delete.
        if ($token !== null && method_exists($token, 'delete')) {
            $token->delete();
        }

        if ($request->hasSession()) {
            Auth::guard('web')->logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }

    private function wantsToken(Request $request): bool
    {
        return $request->filled('device_name') || ! $request->hasSession();
    }

    /**
     * Tokens carry the user's permissions as abilities, so a leaked storefront
     * token cannot be replayed against an admin endpoint even if the account
     * is later promoted.
     *
     * @return array<int, string>
     */
    private function abilitiesFor(User $user): array
    {
        $permissions = $user->getAllPermissions()->pluck('name')->all();

        return $permissions === [] ? [self::STOREFRONT_ABILITY] : $permissions;
    }
}
