<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreUserRequest;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $this->authorize('viewAny', User::class);

        $users = User::query()
            ->with('roles')
            ->when($request->filled('search'), function ($query) use ($request): void {
                $term = '%'.$request->string('search')->value().'%';
                $query->where(fn ($q) => $q->where('name', 'like', $term)
                    ->orWhere('email', 'like', $term)
                    ->orWhere('phone', 'like', $term));
            })
            ->when($request->filled('role'), fn ($q) => $q->role($request->string('role')->value()))
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->when($request->boolean('trashed'), fn ($q) => $q->onlyTrashed())
            ->latest('id')
            ->paginate($request->integer('per_page', 20));

        return UserResource::collection($users);
    }

    public function store(StoreUserRequest $request): JsonResponse
    {
        $this->authorize('create', User::class);
        $this->authorize('assignRoles', [User::class, $request->input('roles', [])]);

        $user = DB::transaction(function () use ($request): User {
            $user = User::create($request->safe()->only(['name', 'email', 'phone', 'password', 'is_active']));
            $user->syncRoles($request->input('roles', []));

            return $user;
        });

        return response()->json([
            'message' => 'User created.',
            'user' => new UserResource($user->load('roles.permissions', 'permissions')),
        ], 201);
    }

    public function show(User $user): UserResource
    {
        $this->authorize('view', $user);

        return new UserResource($user->load('roles.permissions', 'permissions', 'customer'));
    }

    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $this->authorize('update', $user);

        if ($request->has('roles')) {
            $this->authorize('assignRoles', [User::class, $request->input('roles', [])]);
        }

        DB::transaction(function () use ($request, $user): void {
            $data = $request->safe()->only(['name', 'email', 'phone', 'is_active']);

            if ($request->filled('password')) {
                $data['password'] = $request->string('password')->value();
            }

            $user->update($data);

            if ($request->has('roles')) {
                $user->syncRoles($request->input('roles', []));
            }
        });

        return response()->json([
            'message' => 'User updated.',
            'user' => new UserResource($user->fresh()->load('roles.permissions', 'permissions')),
        ]);
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        $this->authorize('delete', $user);

        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'User deactivated and removed.']);
    }

    public function restore(int $id): JsonResponse
    {
        $user = User::onlyTrashed()->findOrFail($id);

        $this->authorize('restore', $user);

        $user->restore();

        return response()->json([
            'message' => 'User restored.',
            'user' => new UserResource($user->load('roles.permissions', 'permissions')),
        ]);
    }
}
