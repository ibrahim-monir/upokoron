<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A user deactivated mid-session must stop working immediately, not at token
 * expiry. Applied to every authenticated route.
 */
class EnsureAccountIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user !== null && ! $user->is_active) {
            return response()->json([
                'message' => 'This account has been deactivated.',
                'code' => 'account_inactive',
            ], 403);
        }

        return $next($request);
    }
}
