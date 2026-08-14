<?php

declare(strict_types=1);

namespace App\Services\Order;

use App\Models\CustomerAddress;
use App\Models\PaymentMethod;
use App\Models\ShippingRate;

/**
 * What the caller is allowed to choose at checkout.
 *
 * Read the list: an address, a delivery option, a payment method, a note.
 * There is no price, no subtotal, no delivery charge and no total, because
 * those are not the customer's to state. Everything on the invoice is worked
 * out by OrderService from the cart and the catalogue.
 *
 * Keeping that as a typed object rather than an array is the point -- there
 * is nowhere to smuggle a `total` through.
 */
final class PlaceOrderData
{
    public function __construct(
        public readonly ShippingRate $shippingRate,
        public readonly PaymentMethod $paymentMethod,

        /** An address the customer already saved, or... */
        public readonly ?CustomerAddress $address = null,

        /** ...one typed in at checkout, for a guest. @var array<string, string|null>|null */
        public readonly ?array $addressFields = null,

        public readonly ?string $customerNote = null,
    ) {}

    /**
     * The delivery address as plain fields, whichever way it arrived.
     *
     * @return array<string, string|null>
     */
    public function shippingFields(): array
    {
        if ($this->address !== null) {
            return [
                'name' => $this->address->name,
                'phone' => $this->address->phone,
                'address_line1' => $this->address->address_line1,
                'address_line2' => $this->address->address_line2,
                'area' => $this->address->area,
                'city' => $this->address->city,
                'district' => $this->address->district,
                'postcode' => $this->address->postcode,
                'country' => $this->address->country ?? 'BD',
            ];
        }

        $fields = $this->addressFields ?? [];

        return [
            'name' => $fields['name'] ?? '',
            'phone' => $fields['phone'] ?? '',
            'address_line1' => $fields['address_line1'] ?? '',
            'address_line2' => $fields['address_line2'] ?? null,
            'area' => $fields['area'] ?? null,
            'city' => $fields['city'] ?? '',
            'district' => $fields['district'] ?? '',
            'postcode' => $fields['postcode'] ?? null,
            'country' => $fields['country'] ?? 'BD',
        ];
    }
}
