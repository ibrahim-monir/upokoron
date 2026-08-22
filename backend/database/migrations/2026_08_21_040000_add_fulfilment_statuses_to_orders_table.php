<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Four more steps in an order's life: on hold, processing, ready to ship,
 * and out for delivery.
 *
 * `orders.status` is a MySQL ENUM, so the column has to be told about a new
 * value before a row can hold one -- the PHP enum alone is not enough, and
 * the failure without this is an insert rejected at the database.
 *
 * The value lists below are written out in full rather than read from
 * `OrderStatus::values()`. The original create migration does read from the
 * enum, which means a fresh database already arrives with whatever the code
 * currently declares; but a migration that reads today's code does not
 * describe a fixed change, and the next person to add a status would
 * silently redefine this one. What a migration did should not move.
 */
return new class extends Migration
{
    private const BEFORE = [
        'pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'returned',
    ];

    private const AFTER = [
        'pending', 'on_hold', 'confirmed', 'processing', 'packed', 'ready_to_ship',
        'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned',
    ];

    public function up(): void
    {
        $this->setStatusColumn(self::AFTER);
    }

    public function down(): void
    {
        /*
         * Rolling back cannot leave orders sitting in a status the column is
         * about to stop accepting. Each new status falls back to the nearest
         * older one that means the same thing operationally, so no order is
         * lost and none is moved past a point it has not reached:
         *
         *   on hold         -> pending    (not yet accepted)
         *   processing      -> confirmed  (accepted, not yet boxed)
         *   ready to ship   -> packed     (boxed, still here)
         *   out for delivery-> shipped    (with the courier)
         *
         * The ledger is untouched by any of these, so nothing has to be
         * unposted -- which is only true because none of the four were
         * allowed to post anything in the first place.
         */
        foreach ([
            'on_hold' => 'pending',
            'processing' => 'confirmed',
            'ready_to_ship' => 'packed',
            'out_for_delivery' => 'shipped',
        ] as $from => $to) {
            DB::table('orders')->where('status', $from)->update(['status' => $to]);
        }

        $this->setStatusColumn(self::BEFORE);
    }

    /**
     * @param  array<int, string>  $values
     */
    private function setStatusColumn(array $values): void
    {
        // MODIFY rather than a drop-and-add, so the index on this column and
        // the composite indexes it takes part in survive untouched.
        $list = implode(', ', array_map(
            static fn (string $value): string => "'".$value."'",
            $values,
        ));

        DB::statement("ALTER TABLE `orders` MODIFY `status` ENUM({$list}) NOT NULL DEFAULT 'pending'");
    }
};
