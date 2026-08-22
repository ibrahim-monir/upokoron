<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Auditable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One payment instrument a customer has saved.
 *
 * Either a mobile wallet (an account number they send from) or a card held
 * as a gateway token. Never a card number: see the migration for why the
 * column does not exist.
 */
class CustomerPaymentMethod extends Model
{
    use Auditable, HasFactory;

    protected $fillable = [
        'customer_id',
        'payment_method_id',
        'label',
        'account_number',
        'account_name',
        'card_brand',
        'card_last4',
        'card_expiry_month',
        'card_expiry_year',
        'gateway_token',
        'is_default',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
            'card_expiry_month' => 'integer',
            'card_expiry_year' => 'integer',
        ];
    }

    /**
     * The token is a credential: it can be used to charge the customer, so
     * it never travels to the browser and never lands in a log.
     *
     * @var array<int, string>
     */
    protected $hidden = ['gateway_token'];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function method(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class, 'payment_method_id');
    }

    public function isCard(): bool
    {
        return $this->card_last4 !== null;
    }

    /**
     * What to show in a list: enough to tell two saved wallets apart, and
     * not enough to be worth stealing.
     */
    public function displayNumber(): ?string
    {
        if ($this->isCard()) {
            return '•••• '.$this->card_last4;
        }

        if ($this->account_number === null) {
            return null;
        }

        /*
         * A wallet number is the customer's own phone number, shown back to
         * the person it belongs to on a page only they can open. Masking the
         * middle keeps it from being read over a shoulder while still being
         * recognisable to its owner, who knows their own last four.
         */
        $number = $this->account_number;

        return strlen($number) <= 5
            ? $number
            : substr($number, 0, 3).str_repeat('•', max(strlen($number) - 7, 0)).substr($number, -4);
    }
}
