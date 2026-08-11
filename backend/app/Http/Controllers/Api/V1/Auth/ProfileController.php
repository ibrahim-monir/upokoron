<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\UpdateProfileRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProfileController extends Controller
{
    public function show(Request $request): UserResource
    {
        return new UserResource(
            $request->user()->load('roles.permissions', 'permissions', 'customer.addresses')
        );
    }

    public function update(UpdateProfileRequest $request): JsonResponse
    {
        $user = $request->user();

        DB::transaction(function () use ($request, $user): void {
            $user->update($request->safe()->only(['name', 'email', 'phone']));

            // The customer profile mirrors the contact details so admin-side
            // customer screens do not have to join through users to show a
            // phone number.
            $user->customer?->update($request->safe()->only(['name', 'email', 'phone']));
        });

        return response()->json([
            'message' => 'Profile updated.',
            'user' => new UserResource($user->fresh()->load('roles', 'customer')),
        ]);
    }
}
