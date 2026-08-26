<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use App\Enums\RewardPointType;
use App\Models\RewardPointTransaction;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class UpdateProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $id = $this->user()->id;

        // Once the completion bonus has been paid, the three details it was
        // paid for have to stay on file. Otherwise the bonus is claimable by
        // filling the form in, banking the points and emptying it again --
        // and the shop is left having bought a birthday it no longer has.
        $keep = $this->completionBonusClaimed() ? 'required' : 'nullable';

        return [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['nullable', 'email:rfc', 'max:190', Rule::unique('users', 'email')->ignore($id)],
            'phone' => [$keep, 'string', 'regex:/^01[3-9]\d{8}$/', Rule::unique('users', 'phone')->ignore($id)],

            // These live on the customer record, not the user: they are facts
            // about the shopper, not about the login. Optional until the
            // shopper trades them for points -- nobody is stopped from buying
            // a sofa for declining to answer.
            'gender' => ['nullable', Rule::in(['male', 'female', 'other'])],
            'date_of_birth' => [$keep, 'date', 'before:today'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        if (! $this->completionBonusClaimed()) {
            return [];
        }

        $why = 'You have already been given reward points for completing your profile, so this cannot be left empty.';

        return ['phone.required' => $why, 'date_of_birth.required' => $why];
    }

    /**
     * Whether this shopper has been paid the profile-completion bonus.
     *
     * Read from the points ledger rather than from a flag on the customer,
     * because the ledger is what actually says they were paid -- and it is
     * the only record that survives a settings change or a manual reversal.
     */
    private function completionBonusClaimed(): bool
    {
        $customerId = $this->user()?->customer?->id;

        if ($customerId === null) {
            return false;
        }

        return RewardPointTransaction::where('customer_id', $customerId)
            ->where('type', RewardPointType::ProfileCompletion->value)
            ->exists();
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (blank($this->input('email')) && blank($this->input('phone'))) {
                $validator->errors()->add('phone', 'Keep at least one of mobile number or email address.');
            }
        });
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'phone' => $this->filled('phone') ? preg_replace('/\D/', '', (string) $this->input('phone')) : null,
            'email' => $this->filled('email') ? strtolower(trim((string) $this->input('email'))) : null,
        ]);
    }
}
