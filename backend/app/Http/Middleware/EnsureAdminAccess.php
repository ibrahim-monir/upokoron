<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Support\Permissions;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gate for every admin route. Individual endpoints still declare their own
 * permission on top of this -- this only answers "may this account open the
 * admin panel at all".
 */
class EnsureAdminAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user === null) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if (! $user->is_active) {
            return response()->json([
                'message' => 'This account has been deactivated.',
                'code' => 'account_inactive',
            ], 403);
        }

        if (! $user->can(Permissions::ADMIN_ACCESS)) {
            return response()->json([
                'message' => 'You do not have access to the admin panel.',
                'code' => 'admin_access_denied',
            ], 403);
        }

        return $next($request);
    }
}
