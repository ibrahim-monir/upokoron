<?php

declare(strict_types=1);

namespace App\Models;

use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class CustomerAddress extends Model
{
    use Auditable, SoftDeletes;

    protected $fillable = [
        'customer_id',
        'label',
        'name',
        'phone',
        'address_line1',
        'address_line2',
        'area',
        'city',
        'district',
        'postcode',
        'country',
        'latitude',
        'longitude',
        'is_default_shipping',
        'is_default_billing',
    ];

    protected function casts(): array
    {
        return [
            'is_default_shipping' => 'boolean',
            'is_default_billing' => 'boolean',
        ];
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Flat snapshot stored on an order. Orders keep a copy rather than a
     * foreign key, because a customer editing their address years later must
     * not silently rewrite where a past order was delivered.
     *
     * @return array<string, mixed>
     */
    public function toSnapshot(): array
    {
        return [
            'name' => $this->name,
            'phone' => $this->phone,
            'address_line1' => $this->address_line1,
            'address_line2' => $this->address_line2,
            'area' => $this->area,
            'city' => $this->city,
            'district' => $this->district,
            'postcode' => $this->postcode,
            'country' => $this->country,
        ];
    }
}
