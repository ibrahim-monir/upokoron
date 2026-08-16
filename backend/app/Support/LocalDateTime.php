<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * A `datetime-local` input has no timezone of its own -- it is a bare
 * "2026-08-16T09:30" wall-clock string, and the browser that produced it
 * could be anywhere. Left to `Carbon::parse()`, that string is read back in
 * `config('app.timezone')` (UTC here), which is only correct for an admin
 * sitting in UTC.
 *
 * Every scheduling field an admin edits through one of these inputs --
 * a product's publish date, a banner's or coupon's start/end -- is a
 * decision made in the shop's own timezone, not the admin's. This is the
 * one place that decision gets translated to UTC for storage, so the
 * translation happens exactly once rather than being reinvented (and
 * silently gotten wrong) in every controller that touches one of these
 * fields.
 */
final class LocalDateTime
{
    /**
     * @return non-empty-string|null
     */
    public static function toUtc(?string $value): ?string
    {
        if (blank($value)) {
            return null;
        }

        return Carbon::parse($value, config('upokoron.display_timezone'))
            ->utc()
            ->toDateTimeString();
    }
}
