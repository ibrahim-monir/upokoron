<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Support\Money;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreJournalEntryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Permission checked in the controller.
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'entry_date' => ['nullable', 'date'],
            'event' => ['nullable', 'string', 'max:40', 'regex:/^[a-z0-9_]+$/'],
            'memo' => ['nullable', 'string', 'max:255'],

            'lines' => ['required', 'array', 'min:2'],
            'lines.*.account_id' => [
                'required',
                // Group accounts are report headers; posting to one would
                // produce a balance nobody reads.
                Rule::exists('accounts', 'id')->where('is_group', false)->where('is_active', true),
            ],
            'lines.*.type' => ['required', Rule::in(['debit', 'credit'])],
            'lines.*.amount' => ['required', 'numeric', 'gt:0'],
            'lines.*.memo' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Reject an unbalanced entry here, with a field-level message the UI can
     * show, rather than letting JournalService throw a 500-level bug report
     * at a user who simply mistyped a figure.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $lines = $this->input('lines');

            if (! is_array($lines)) {
                return;
            }

            $debit = Money::zero();
            $credit = Money::zero();

            foreach ($lines as $line) {
                if (! isset($line['amount'], $line['type']) || ! is_numeric($line['amount'])) {
                    return; // Field rules will report this.
                }

                $amount = Money::of((string) $line['amount']);

                $line['type'] === 'debit'
                    ? $debit = $debit->plus($amount)
                    : $credit = $credit->plus($amount);
            }

            if (! $debit->equals($credit)) {
                $validator->errors()->add(
                    'lines',
                    sprintf(
                        'Debits and credits must match. Debits %s, credits %s, difference %s.',
                        $debit->format(),
                        $credit->format(),
                        $debit->minus($credit)->abs()->format(),
                    ),
                );
            }
        });
    }
}
