<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The signed-in customer's own delivery addresses.
 *
 * Everything is scoped to the caller's customer record rather than looked up
 * by id alone -- an address id is a guessable integer, and scoping is what
 * stops one customer reading another's home address by counting upwards.
 */
class AddressController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $customer = $this->customer($request);

        $addresses = CustomerAddress::query()
            ->where('customer_id', $customer->id)
            ->orderByDesc('is_default_shipping')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $addresses->map(fn (CustomerAddress $a): array => $this->present($a))->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $customer = $this->customer($request);
        $data = $this->validated($request);

        $address = DB::transaction(function () use ($customer, $data): CustomerAddress {
            $address = CustomerAddress::create($data + [
                'customer_id' => $customer->id,
                // The first address a customer saves is their default, or
                // checkout has nothing preselected and every order starts
                // with an unnecessary decision.
                'is_default_shipping' => $data['is_default_shipping']
                    ?? ! CustomerAddress::where('customer_id', $customer->id)->exists(),
            ]);

            $this->syncDefault($address);

            return $address;
        });

        return response()->json(['data' => $this->present($address)], 201);
    }

    public function update(Request $request, CustomerAddress $address): JsonResponse
    {
        $customer = $this->customer($request);

        abort_unless($address->customer_id === $customer->id, 404);

        $data = $this->validated($request);

        DB::transaction(function () use ($address, $data): void {
            $address->update($data);

            $this->syncDefault($address->refresh());
        });

        return response()->json(['data' => $this->present($address->refresh())]);
    }

    public function destroy(Request $request, CustomerAddress $address): JsonResponse
    {
        $customer = $this->customer($request);

        abort_unless($address->customer_id === $customer->id, 404);

        // Soft-deleted: a delivered order points at the address it went to,
        // and that record must survive the customer tidying up their book.
        $address->delete();

        // Losing the default silently would leave checkout with nothing
        // preselected and no explanation.
        if ($address->is_default_shipping) {
            $next = CustomerAddress::where('customer_id', $customer->id)->orderBy('id')->first();

            $next?->forceFill(['is_default_shipping' => true])->save();
        }

        return response()->json(['message' => 'Address removed.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'label' => ['nullable', 'string', 'max:50'],
            'name' => ['required', 'string', 'max:120'],
            // Bangladeshi mobile numbers: 01XXXXXXXXX, with or without +88.
            'phone' => ['required', 'string', 'regex:/^(\+?88)?01[3-9]\d{8}$/'],
            'address_line1' => ['required', 'string', 'max:200'],
            'address_line2' => ['nullable', 'string', 'max:200'],
            'area' => ['nullable', 'string', 'max:100'],
            'city' => ['required', 'string', 'max:100'],
            'district' => ['required', 'string', 'max:100'],
            'postcode' => ['nullable', 'string', 'max:20'],
            'country' => ['sometimes', Rule::in(['BD'])],
            'is_default_shipping' => ['sometimes', 'boolean'],
            'is_default_billing' => ['sometimes', 'boolean'],
        ]);
    }

    /**
     * Exactly one default of each kind per customer.
     */
    private function syncDefault(CustomerAddress $address): void
    {
        foreach (['is_default_shipping', 'is_default_billing'] as $flag) {
            if (! $address->{$flag}) {
                continue;
            }

            CustomerAddress::where('customer_id', $address->customer_id)
                ->where('id', '!=', $address->id)
                ->where($flag, true)
                ->update([$flag => false]);
        }
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user()?->customer;

        // A signed-in user with no customer record cannot be given someone
        // else's; this is a broken registration, not an empty address book.
        abort_if($customer === null, 403, 'This account cannot place orders.');

        return $customer;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(CustomerAddress $address): array
    {
        return [
            'id' => $address->id,
            'label' => $address->label,
            'name' => $address->name,
            'phone' => $address->phone,
            'address_line1' => $address->address_line1,
            'address_line2' => $address->address_line2,
            'area' => $address->area,
            'city' => $address->city,
            'district' => $address->district,
            'postcode' => $address->postcode,
            'country' => $address->country,
            'is_default_shipping' => $address->is_default_shipping,
            'is_default_billing' => $address->is_default_billing,
        ];
    }
}
