<?php

declare(strict_types=1);

namespace App\Enums;

enum InventoryDirection: string
{
    case In = 'in';
    case Out = 'out';

    public function sign(): int
    {
        return $this === self::In ? 1 : -1;
    }

    public function opposite(): self
    {
        return $this === self::In ? self::Out : self::In;
    }
}
