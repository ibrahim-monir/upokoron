<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\RoleResource;
use App\Support\Permissions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Role::class);

        $roles = Role::with('permissions')->orderBy('id')->get();

        $counts = $this->userCountsByRole();

        $roles->each(fn (Role $role) => $role->setAttribute('users_count', $counts[$role->id] ?? 0));

        return RoleResource::collection($roles);
    }

    /**
     * The permission catalogue, grouped for rendering as a checklist.
     */
    public function permissions(): JsonResponse
    {
        $this->authorize('viewAny', Role::class);

        return response()->json(['data' => Permissions::all()]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Role::class);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:60', 'regex:/^[a-z0-9_]+$/', 'unique:roles,name'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', Rule::in(Permissions::names())],
        ]);

        $this->guardAgainstEscalation($request->input('permissions', []));

        $role = DB::transaction(function () use ($validated): Role {
            $role = Role::create(['name' => $validated['name'], 'guard_name' => 'web']);
            $role->syncPermissions($validated['permissions'] ?? []);

            return $role;
        });

        return response()->json([
            'message' => 'Role created.',
            'role' => new RoleResource($role->load('permissions')),
        ], 201);
    }

    public function show(Role $role): RoleResource
    {
        $this->authorize('view', $role);

        $role->load('permissions')->setAttribute('users_count', $role->users()->count());

        return new RoleResource($role);
    }

    /**
     * Count assigned users straight from the pivot.
     *
     * `withCount('users')` cannot be used here: Spatie resolves the related
     * model from the role's own `guard_name` attribute, and the bare instance
     * the query builder constructs for an aggregate has no attributes yet, so
     * the relation resolves to a null class name.
     *
     * @return array<int, int>
     */
    private function userCountsByRole(): array
    {
        return DB::table(config('permission.table_names.model_has_roles', 'model_has_roles'))
            ->select('role_id', DB::raw('COUNT(*) as aggregate'))
            ->groupBy('role_id')
            ->pluck('aggregate', 'role_id')
            ->map(fn ($count) => (int) $count)
            ->all();
    }

    public function update(Request $request, Role $role): JsonResponse
    {
        $this->authorize('update', $role);

        $validated = $request->validate([
            'name' => [
                'required', 'string', 'max:60', 'regex:/^[a-z0-9_]+$/',
                Rule::unique('roles', 'name')->ignore($role->id),
            ],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', Rule::in(Permissions::names())],
        ]);

        $this->guardAgainstEscalation($request->input('permissions', []));

        DB::transaction(function () use ($request, $validated, $role): void {
            // Renaming a protected role would break hasRole('owner') checks in
            // code, so the policy already blocks non-owners from getting here.
            $role->update(['name' => $validated['name']]);

            if ($request->has('permissions')) {
                $role->syncPermissions($validated['permissions'] ?? []);
            }
        });

        return response()->json([
            'message' => 'Role updated.',
            'role' => new RoleResource($role->fresh()->load('permissions')),
        ]);
    }

    public function destroy(Role $role): JsonResponse
    {
        $this->authorize('delete', $role);

        $role->delete();

        return response()->json(['message' => 'Role deleted.']);
    }

    /**
     * Nobody may build a role holding permissions they do not have themselves.
     *
     * @param  array<int, string>  $permissions
     */
    private function guardAgainstEscalation(array $permissions): void
    {
        $actor = request()->user();

        if ($actor->hasRole('owner') || $permissions === []) {
            return;
        }

        $held = $actor->getAllPermissions()->pluck('name')->all();

        if (array_diff($permissions, $held) !== []) {
            abort(403, 'You cannot grant permissions you do not hold yourself.');
        }
    }
}
