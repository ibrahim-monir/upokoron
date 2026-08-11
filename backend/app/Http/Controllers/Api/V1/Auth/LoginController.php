<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Enums\AuditEvent;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Services\Auth\AuthSessionIssuer;
use App\Services\Support\AuditService;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class LoginController extends Controller
{
    public function __construct(
        private readonly AuthSessionIssuer $issuer,
        private readonly AuditService $audit,
    ) {}

    /**
     * Storefront login. Any active account may use it.
     */
    public function store(LoginRequest $request): JsonResponse
    {
        $user = $request->authenticateUser($this->audit);

        $payload = $this->issuer->issue($request, $user, $request->boolean('remember'));

        $this->audit->record(AuditEvent::Login, $user, null, ['guard' => isset($payload['token']) ? 'token' : 'session']);

        return response()->json($payload);
    }

    /**
     * Admin login. Same credentials, but the account must be able to reach the
     * admin panel -- checked here so staff get a clear refusal at login rather
     * than a wall of 403s afterwards.
     */
    public function storeAdmin(LoginRequest $request): JsonResponse
    {
        $user = $request->authenticateUser($this->audit);

        if (! $user->can(Permissions::ADMIN_ACCESS)) {
            $this->audit->record(AuditEvent::LoginFailed, $user, null, ['reason' => 'no_admin_access']);

            throw ValidationException::withMessages([
                'identifier' => 'This account does not have admin access.',
            ]);
        }

        $payload = $this->issuer->issue($request, $user, $request->boolean('remember'));

        $this->audit->record(AuditEvent::Login, $user, null, ['scope' => 'admin']);

        return response()->json($payload);
    }

    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user !== null) {
            $this->audit->record(AuditEvent::Logout, $user);
        }

        $this->issuer->revoke($request);

        return response()->json(['message' => 'Signed out.']);
    }
}
