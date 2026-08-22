<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Shop;

use App\Enums\PaymentMethodType;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPaymentMethod;
use App\Models\PaymentMethod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * The signed-in customer's own saved payment details.
 *
 * Scoped to the caller's customer record on every action rather than looked
 * up by id alone: the id is a guessable integer, and scoping is what stops
 * one customer reading -- or deleting -- another's saved wallet.
 *
 * What can be saved is a mobile wallet number. A card can only be saved as a
 * token issued by a payment gateway, and this shop has no gateway wired up
 * yet, so `store` refuses card fields rather than pretending. When a gateway
 * arrives, the token it returns is what lands in `gateway_token` -- the card
 * number never passes through this application at all.
 */
class CustomerPaymentMethodController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $customer = $this->customer($request);

        $saved = CustomerPaymentMethod::query()
            ->where('customer_id', $customer->id)
            ->with('method:id,name,code,type,instructions')
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $saved->map(fn (CustomerPaymentMethod $m): array => $this->present($m))->all(),

            // The methods a wallet can be saved against, so the form does not
            // need a second request to fill its dropdown.
            'available' => $this->savableMethods()
                ->map(fn (PaymentMethod $m): array => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'code' => $m->code,
                    'instructions' => $m->instructions,
                ])
                ->values()
                ->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $customer = $this->customer($request);

        $data = $request->validate([
            'payment_method_id' => [
                'required',
                'integer',
                // Only a method the shop actually accepts, and only one money
                // is sent FROM. Saving a wallet number against cash on
                // delivery would be a number that never gets used.
                Rule::in($this->savableMethods()->pluck('id')->all()),
            ],
            'account_number' => ['required', 'string', 'regex:/^(\+?88)?01[3-9]\d{8}$/'],
            'account_name' => ['nullable', 'string', 'max:120'],
            'label' => ['nullable', 'string', 'max:50'],
            'is_default' => ['sometimes', 'boolean'],
        ], [
            'payment_method_id.in' => 'That is not a payment method you can save details for.',
            'account_number.regex' => 'Enter the mobile number of the wallet, like 01712345678.',
        ]);

        $data['account_number'] = $this->normalisePhone($data['account_number']);

        $duplicate = CustomerPaymentMethod::query()
            ->where('customer_id', $customer->id)
            ->where('payment_method_id', $data['payment_method_id'])
            ->where('account_number', $data['account_number'])
            ->exists();

        if ($duplicate) {
            return response()->json([
                'message' => 'That number is already saved for this payment method.',
                'code' => 'already_saved',
            ], 409);
        }

        $saved = DB::transaction(function () use ($customer, $data): CustomerPaymentMethod {
            $method = CustomerPaymentMethod::create($data + [
                'customer_id' => $customer->id,
                // The first one saved becomes the default, or checkout has
                // nothing preselected and the saving achieved nothing.
                'is_default' => $data['is_default']
                    ?? ! CustomerPaymentMethod::where('customer_id', $customer->id)->exists(),
            ]);

            $this->syncDefault($method);

            return $method;
        });

        return response()->json([
            'message' => 'Payment method saved.',
            'data' => $this->present($saved->load('method:id,name,code,type,instructions')),
        ], 201);
    }

    /**
     * Rename it, or make it the default. The number itself is not editable:
     * a different number is a different instrument, and editing in place
     * would silently repoint whatever else referred to this one.
     */
    public function update(Request $request, CustomerPaymentMethod $paymentMethod): JsonResponse
    {
        $customer = $this->customer($request);

        abort_unless($paymentMethod->customer_id === $customer->id, 404);

        $data = $request->validate([
            'label' => ['nullable', 'string', 'max:50'],
            'is_default' => ['sometimes', 'boolean'],
        ]);

        DB::transaction(function () use ($paymentMethod, $data): void {
            $paymentMethod->update($data);

            $this->syncDefault($paymentMethod->refresh());
        });

        return response()->json([
            'message' => 'Payment method updated.',
            'data' => $this->present($paymentMethod->refresh()->load('method:id,name,code,type,instructions')),
        ]);
    }

    public function destroy(Request $request, CustomerPaymentMethod $paymentMethod): JsonResponse
    {
        $customer = $this->customer($request);

        abort_unless($paymentMethod->customer_id === $customer->id, 404);

        $wasDefault = $paymentMethod->is_default;

        DB::transaction(function () use ($customer, $paymentMethod, $wasDefault): void {
            $paymentMethod->delete();

            // Removing the default must leave one behind, or the customer
            // silently goes back to picking every time.
            if ($wasDefault) {
                CustomerPaymentMethod::where('customer_id', $customer->id)
                    ->orderBy('id')
                    ->first()
                    ?->update(['is_default' => true]);
            }
        });

        return response()->json(['message' => 'Payment method removed.']);
    }

    /**
     * The shop methods a customer can save details against.
     *
     * Manual transfers only for now -- bKash, Nagad, a bank account: the
     * ones where the customer sends the money and needs their own number
     * remembered. Cash and cash-on-delivery have nothing to save, and
     * gateway methods save a token rather than anything typed in.
     *
     * @return \Illuminate\Support\Collection<int, PaymentMethod>
     */
    private function savableMethods()
    {
        return PaymentMethod::query()
            ->active()
            ->where('type', PaymentMethodType::Manual->value)
            ->orderBy('position')
            ->get();
    }

    /** Stored without the country code, so two spellings are one number. */
    private function normalisePhone(string $number): string
    {
        $digits = preg_replace('/\D/', '', $number) ?? '';

        return str_starts_with($digits, '88') ? substr($digits, 2) : $digits;
    }

    /** Exactly one default per customer. */
    private function syncDefault(CustomerPaymentMethod $method): void
    {
        if (! $method->is_default) {
            return;
        }

        CustomerPaymentMethod::query()
            ->where('customer_id', $method->customer_id)
            ->whereKeyNot($method->id)
            ->update(['is_default' => false]);
    }

    private function customer(Request $request): Customer
    {
        $customer = $request->user()?->customer;

        abort_if($customer === null, 403, 'This account cannot save payment details.');

        return $customer;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(CustomerPaymentMethod $method): array
    {
        return [
            'id' => $method->id,
            'label' => $method->label,
            'account_name' => $method->account_name,

            // Masked, never the whole number: this is read on a phone in
            // public as often as anywhere else.
            'display_number' => $method->displayNumber(),

            'is_card' => $method->isCard(),
            'card_brand' => $method->card_brand,
            'is_default' => $method->is_default,

            'method' => $method->method === null ? null : [
                'id' => $method->method->id,
                'name' => $method->method->name,
                'code' => $method->method->code,
                'instructions' => $method->method->instructions,
            ],
        ];
    }
}
