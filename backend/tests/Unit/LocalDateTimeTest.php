<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Support\LocalDateTime;
// Laravel's base test case, not PHPUnit's: toUtc() reads display_timezone
// from config, which needs a booted container.
use Tests\TestCase;

class LocalDateTimeTest extends TestCase
{
    public function test_it_converts_a_dhaka_wall_clock_string_to_utc(): void
    {
        // Dhaka is UTC+6, year-round, with no daylight saving to complicate it.
        $this->assertSame('2026-08-16 03:30:00', LocalDateTime::toUtc('2026-08-16T09:30'));
    }

    public function test_blank_values_stay_null(): void
    {
        $this->assertNull(LocalDateTime::toUtc(null));
        $this->assertNull(LocalDateTime::toUtc(''));
    }

    /**
     * The bug this class exists to prevent: a value already round-tripped
     * once must not drift further on a second save just because nobody
     * touched the field.
     */
    public function test_converting_twice_is_not_the_same_as_converting_once(): void
    {
        $once = LocalDateTime::toUtc('2026-08-16T09:30');

        // A second, unrelated save must convert the ORIGINAL admin input
        // again, not re-convert an already-UTC value -- this test exists to
        // make that distinction explicit for anyone tempted to pipe a
        // stored UTC value back through toUtc() a second time.
        $this->assertNotSame($once, LocalDateTime::toUtc($once));
    }
}
