<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\SettingType;
use App\Models\Concerns\Auditable;
use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    use Auditable;

    protected $fillable = [
        'key',
        'group',
        'value',
        'type',
        'is_public',
        'label',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'type' => SettingType::class,
            'is_public' => 'boolean',
        ];
    }

    /**
     * The value cast to its declared PHP type.
     */
    public function typedValue(): mixed
    {
        return $this->type->cast($this->value);
    }
}
