<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AccountResource;
use App\Models\Account;
use App\Models\AccountType;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Validation\Rule;

class AccountController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        abort_unless($request->user()?->can('accounting.view'), 403);

        $accounts = Account::with('type')
            ->when($request->filled('category'), fn ($q) => $q->whereHas(
                'type',
                fn ($t) => $t->where('category', $request->string('category')->value())
            ))
            ->when($request->filled('search'), function ($q) use ($request): void {
                $term = '%'.$request->string('search')->value().'%';
                $q->where(fn ($w) => $w->where('name', 'like', $term)->orWhere('code', 'like', $term));
            })
            ->when($request->boolean('postable_only'), fn ($q) => $q->postable())
            ->orderBy('code')
            ->get();

        return AccountResource::collection($accounts);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('accounts.manage'), 403);

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:20', 'unique:accounts,code'],
            'name' => ['required', 'string', 'max:120'],
            'account_type_id' => ['required', Rule::exists('account_types', 'id')],
            'parent_id' => ['nullable', Rule::exists('accounts', 'id')],
            'is_group' => ['sometimes', 'boolean'],
            'opening_balance' => ['sometimes', 'numeric'],
            'opening_balance_date' => ['nullable', 'date'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $account = Account::create($validated + ['is_active' => true, 'is_system' => false]);

        return response()->json([
            'message' => 'Account created.',
            'account' => new AccountResource($account->load('type')),
        ], 201);
    }

    public function show(Request $request, Account $account): AccountResource
    {
        abort_unless($request->user()?->can('accounting.view'), 403);

        return new AccountResource($account->load('type', 'parent'));
    }

    public function update(Request $request, Account $account): JsonResponse
    {
        abort_unless($request->user()?->can('accounts.manage'), 403);

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:20', Rule::unique('accounts', 'code')->ignore($account->id)],
            'name' => ['required', 'string', 'max:120'],
            'account_type_id' => ['required', Rule::exists('account_types', 'id')],
            'parent_id' => ['nullable', Rule::exists('accounts', 'id')],
            'is_active' => ['sometimes', 'boolean'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        /*
         * System accounts may be renamed and renumbered freely -- that is the
         * whole point of resolving them by system_key. What cannot change is
         * their type, because the posting rules depend on an account of that
         * category being there.
         */
        if ($account->is_system && (int) $validated['account_type_id'] !== $account->account_type_id) {
            return response()->json([
                'message' => "Account [{$account->code} {$account->name}] is wired into posting rules; ".
                    'its type cannot be changed. Rename or renumber it instead.',
                'code' => 'system_account_type_locked',
            ], 409);
        }

        if ($account->is_system && $request->has('is_active') && ! $request->boolean('is_active')) {
            return response()->json([
                'message' => "Account [{$account->code}] is required by posting rules and cannot be deactivated.",
                'code' => 'system_account_required',
            ], 409);
        }

        $account->update($validated);

        return response()->json([
            'message' => 'Account updated.',
            'account' => new AccountResource($account->fresh()->load('type')),
        ]);
    }

    public function destroy(Request $request, Account $account): JsonResponse
    {
        abort_unless($request->user()?->can('accounts.manage'), 403);

        if ($account->is_system) {
            return response()->json([
                'message' => "Account [{$account->code}] is required by posting rules and cannot be deleted.",
                'code' => 'system_account_required',
            ], 409);
        }

        // An account with history cannot be removed without orphaning ledger
        // lines. Deactivate it instead: reports keep working, nothing new posts.
        if ($account->lines()->exists()) {
            return response()->json([
                'message' => 'This account has ledger history. Deactivate it instead of deleting it.',
                'code' => 'account_has_history',
            ], 409);
        }

        if ($account->children()->exists()) {
            return response()->json([
                'message' => 'Move or remove the child accounts first.',
                'code' => 'account_has_children',
            ], 409);
        }

        $account->delete();

        return response()->json(['message' => 'Account deleted.']);
    }

    public function types(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('accounting.view'), 403);

        return response()->json([
            'data' => AccountType::orderBy('position')->get()->map(fn (AccountType $t) => [
                'id' => $t->id,
                'code' => $t->code,
                'name' => $t->name,
                'category' => $t->category->value,
                'category_label' => $t->category->label(),
                'normal_balance' => $t->normal_balance->value,
            ]),
        ]);
    }
}
