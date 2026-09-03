<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Enums\PaymentMethodType;
use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\PaymentMethod;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * How the shop gets paid.
 *
 * Unlike the storefront's copy of this list (CheckoutController::show), this
 * one returns every method including inactive ones -- an owner turning bKash
 * back on needs to find it in the list first.
 */
class PaymentMethodController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('payments.manage'), 403);

        $methods = PaymentMethod::query()->orderBy('position')->orderBy('id')->get();

        return response()->json(['data' => $methods->map(fn (PaymentMethod $m): array => $this->present($m))->all()]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('payments.manage'), 403);

        $data = $this->validated($request);

        $method = PaymentMethod::create($data);

        return response()->json(['data' => $this->present($method)], 201);
    }

    public function update(Request $request, PaymentMethod $paymentMethod): JsonResponse
    {
        abort_unless($request->user()?->can('payments.manage'), 403);

        $data = $this->validated($request, $paymentMethod, partial: true);

        $paymentMethod->update($data);

        return response()->json(['data' => $this->present($paymentMethod->refresh())]);
    }

    public function destroy(Request $request, PaymentMethod $paymentMethod): JsonResponse
    {
        abort_unless($request->user()?->can('payments.manage'), 403);

        // The FK is nullable and deletes clean, but doing so would blank the
        // payment method on every past order that used it -- an invoice
        // should still say how it was paid. Turning it off keeps that intact
        // and simply stops offering it at checkout.
        if (Order::where('payment_method_id', $paymentMethod->id)->exists()) {
            throw new BusinessRuleException(
                "\"{$paymentMethod->name}\" has been used on past orders and cannot be deleted. Turn it off instead.",
                'payment_method_in_use',
                ['payment_method_id' => $paymentMethod->id],
            );
        }

        $paymentMethod->delete();

        return response()->json(['message' => 'Payment method removed.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, ?PaymentMethod $method = null, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$required, 'string', 'max:120'],
            'code' => [
                $required, 'string', 'max:40', 'alpha_dash',
                Rule::unique('payment_methods', 'code')->ignore($method),
            ],
            'type' => [$required, Rule::in(array_column(PaymentMethodType::cases(), 'value'))],
            'instructions' => ['nullable', 'string', 'max:1000'],

            // A URL from the image library. The owner uploads the artwork
            // their payment provider gives them; nothing is shipped here.
            'logo' => ['nullable', 'string', 'max:255'],
            // The merchant's own bKash/Nagad number or similar -- shown to
            // the customer at checkout as its own highlighted line, so it is
            // validated as a short id rather than free text.
            'receive_number' => ['nullable', 'string', 'max:32'],
            'extra_charge' => ['sometimes', 'numeric', 'min:0', 'max:99999999'],
            'min_order_total' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'max_order_total' => ['nullable', 'numeric', 'min:0', 'max:99999999', 'gte:min_order_total'],
            'is_active' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(PaymentMethod $method): array
    {
        return [
            'id' => $method->id,
            'name' => $method->name,
            'code' => $method->code,
            'type' => $method->type->value,
            'type_label' => $method->type->label(),
            'instructions' => $method->instructions,
            'logo' => $method->logo,
            'receive_number' => $method->receive_number,
            'extra_charge' => $method->extra_charge,
            'min_order_total' => $method->min_order_total,
            'max_order_total' => $method->max_order_total,
            'is_active' => $method->is_active,
            'position' => $method->position,
        ];
    }
}
