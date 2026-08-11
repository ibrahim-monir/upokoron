<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\AccountCategory;
use App\Enums\NormalBalance;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountType extends Model
{
    protected $fillable = ['name', 'code', 'category', 'normal_balance', 'position'];

    protected function casts(): array
    {
        return [
            'category' => AccountCategory::class,
            'normal_balance' => NormalBalance::class,
            'position' => 'integer',
        ];
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(Account::class);
    }
}
