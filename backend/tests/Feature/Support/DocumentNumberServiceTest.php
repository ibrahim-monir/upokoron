<?php

declare(strict_types=1);

namespace Tests\Feature\Support;

use App\Models\DocumentSequence;
use App\Services\Support\DocumentNumberService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use InvalidArgumentException;
use Tests\TestCase;

class DocumentNumberServiceTest extends TestCase
{
    use RefreshDatabase;

    private DocumentNumberService $numbers;

    protected function setUp(): void
    {
        parent::setUp();
        $this->numbers = app(DocumentNumberService::class);
    }

    public function test_it_formats_a_yearly_sequence(): void
    {
        Carbon::setTestNow('2026-08-09 12:00:00');

        $this->assertSame('PUR-2026-00001', $this->numbers->next('purchase'));
        $this->assertSame('PUR-2026-00002', $this->numbers->next('purchase'));
    }

    public function test_it_formats_a_compact_monthly_sequence(): void
    {
        Carbon::setTestNow('2026-08-09 12:00:00');

        $this->assertSame('08260001', $this->numbers->next('order'));
        $this->assertSame('08260002', $this->numbers->next('order'));
    }

    public function test_it_formats_a_non_resetting_sequence_without_a_year(): void
    {
        $this->assertSame('CUS-000001', $this->numbers->next('customer'));
        $this->assertSame('SUP-00001', $this->numbers->next('supplier'));
    }

    public function test_each_sequence_key_counts_independently(): void
    {
        Carbon::setTestNow('2026-08-09 12:00:00');

        $this->numbers->next('order');
        $this->numbers->next('order');

        $this->assertSame('PUR-2026-00001', $this->numbers->next('purchase'));
        $this->assertSame('08260003', $this->numbers->next('order'));
    }

    public function test_a_yearly_sequence_restarts_in_the_new_year(): void
    {
        // Times are pinned in Dhaka, because the period is chosen in business
        // local time. A bare UTC timestamp late on 31 December already falls
        // into the next year here, which would make this test lie.
        Carbon::setTestNow(Carbon::parse('2026-06-15 12:00:00', 'Asia/Dhaka'));
        $this->assertSame('PUR-2026-00001', $this->numbers->next('purchase'));

        Carbon::setTestNow(Carbon::parse('2027-01-15 12:00:00', 'Asia/Dhaka'));
        $this->assertSame('PUR-2027-00001', $this->numbers->next('purchase'));

        // The 2026 counter is untouched and resumes where it left off.
        Carbon::setTestNow(Carbon::parse('2026-06-16 12:00:00', 'Asia/Dhaka'));
        $this->assertSame('PUR-2026-00002', $this->numbers->next('purchase'));
    }

    public function test_a_monthly_sequence_restarts_each_month(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-20 12:00:00', 'Asia/Dhaka'));
        $this->assertSame('08260001', $this->numbers->next('order'));

        Carbon::setTestNow(Carbon::parse('2026-09-01 12:00:00', 'Asia/Dhaka'));
        $this->assertSame('09260001', $this->numbers->next('order'));

        // August's counter is untouched and resumes where it left off.
        Carbon::setTestNow(Carbon::parse('2026-08-21 12:00:00', 'Asia/Dhaka'));
        $this->assertSame('08260002', $this->numbers->next('order'));
    }

    /**
     * Period boundaries are evaluated in Dhaka time, not UTC. An order placed
     * at 01:00 on 1 January in Dhaka is still 31 December in UTC -- numbering
     * it into the previous period would put it in the wrong month.
     */
    public function test_the_period_is_decided_in_business_local_time(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-12-31 19:00:00', 'UTC'));

        $this->assertSame('01270001', $this->numbers->next('order'));
    }

    public function test_it_never_issues_the_same_number_twice(): void
    {
        Carbon::setTestNow('2026-08-09 12:00:00');

        $issued = [];

        for ($i = 0; $i < 200; $i++) {
            $issued[] = $this->numbers->next('order');
        }

        $this->assertCount(200, array_unique($issued));
        $this->assertSame('08260200', end($issued));
        $this->assertSame(201, DocumentSequence::firstWhere('key', 'order')->next_number);
    }

    public function test_peek_does_not_consume_a_number(): void
    {
        Carbon::setTestNow('2026-08-09 12:00:00');

        $this->assertSame('08260001', $this->numbers->peek('order'));
        $this->assertSame('08260001', $this->numbers->peek('order'));
        $this->assertSame('08260001', $this->numbers->next('order'));
    }

    public function test_an_unknown_sequence_key_fails_loudly(): void
    {
        $this->expectException(InvalidArgumentException::class);

        $this->numbers->next('not_a_real_document');
    }

    public function test_a_rolled_back_transaction_does_not_consume_a_number(): void
    {
        Carbon::setTestNow('2026-08-09 12:00:00');

        $this->assertSame('08260001', $this->numbers->next('order'));

        try {
            \DB::transaction(function (): void {
                $this->numbers->next('order');
                throw new \RuntimeException('document creation failed');
            });
        } catch (\RuntimeException) {
            // expected
        }

        // The failed document released its number, so there is no gap.
        $this->assertSame('08260002', $this->numbers->next('order'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }
}
