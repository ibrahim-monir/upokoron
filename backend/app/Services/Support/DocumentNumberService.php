<?php

declare(strict_types=1);

namespace App\Services\Support;

use App\Models\DocumentSequence;
use Carbon\CarbonInterface;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Concurrency-safe document numbers.
 *
 * MAX(number)+1 hands the same order number to two customers who check out in
 * the same millisecond, and the duplicate is only noticed later, usually by an
 * accountant. Here every allocation takes a row lock on the sequence row, so
 * the increment is serialised by the database rather than by hope.
 *
 * Always call this INSIDE the transaction that creates the document. The lock
 * is then held until that transaction commits, which means a rolled-back
 * document also rolls back its number and leaves no gap.
 */
class DocumentNumberService
{
    /**
     * Allocate the next number for a sequence key, e.g. `order` -> ORD-2026-000141.
     */
    public function next(string $key, ?CarbonInterface $date = null): string
    {
        $config = config("upokoron.sequences.{$key}");

        if (! is_array($config)) {
            throw new InvalidArgumentException("Unknown document sequence [{$key}].");
        }

        $date = $date ? Carbon::instance($date->toDateTime()) : Carbon::now();
        $date = $date->setTimezone(config('upokoron.display_timezone'));

        $reset = $config['reset'] ?? 'yearly';
        $year = $reset === 'none' ? 0 : (int) $date->year;
        $month = $reset === 'monthly' ? (int) $date->month : 0;

        return DB::transaction(function () use ($key, $config, $reset, $year, $month) {
            $sequence = $this->lockOrCreate($key, $config, $reset, $year, $month);

            $number = (int) $sequence->next_number;

            $sequence->newQuery()
                ->whereKey($sequence->getKey())
                ->update(['next_number' => $number + 1, 'updated_at' => now()]);

            return $this->format($config, $reset, $year, $month, $number);
        });
    }

    /**
     * Peek at the next number without consuming it. For previews only --
     * never persist this, because another request may take it first.
     */
    public function peek(string $key, ?CarbonInterface $date = null): string
    {
        $config = config("upokoron.sequences.{$key}");

        if (! is_array($config)) {
            throw new InvalidArgumentException("Unknown document sequence [{$key}].");
        }

        $date = ($date ? Carbon::instance($date->toDateTime()) : Carbon::now())
            ->setTimezone(config('upokoron.display_timezone'));

        $reset = $config['reset'] ?? 'yearly';
        $year = $reset === 'none' ? 0 : (int) $date->year;
        $month = $reset === 'monthly' ? (int) $date->month : 0;

        $sequence = DocumentSequence::where('key', $key)
            ->where('period_year', $year)
            ->where('period_month', $month)
            ->first();

        return $this->format($config, $reset, $year, $month, (int) ($sequence->next_number ?? 1));
    }

    /**
     * Fetch the sequence row under a write lock, creating it on first use.
     *
     * The insert races with other requests, so a duplicate-key failure is an
     * expected outcome, not an error: the other request won, and we simply
     * take the lock on the row it created.
     *
     * @param  array<string, mixed>  $config
     */
    private function lockOrCreate(string $key, array $config, string $reset, int $year, int $month): DocumentSequence
    {
        $find = fn (bool $lock) => DocumentSequence::query()
            ->where('key', $key)
            ->where('period_year', $year)
            ->where('period_month', $month)
            ->when($lock, fn ($q) => $q->lockForUpdate())
            ->first();

        if ($sequence = $find(true)) {
            return $sequence;
        }

        try {
            DocumentSequence::create([
                'key' => $key,
                'prefix' => $config['prefix'],
                'period_year' => $year,
                'period_month' => $month,
                'next_number' => 1,
                'padding' => $config['padding'] ?? 6,
                'reset_period' => $reset,
            ]);
        } catch (QueryException $e) {
            if (! $this->isDuplicateKey($e)) {
                throw $e;
            }
        }

        $sequence = $find(true);

        if ($sequence === null) {
            throw new \RuntimeException("Could not allocate document sequence [{$key}].");
        }

        return $sequence;
    }

    private function isDuplicateKey(QueryException $e): bool
    {
        return $e->getCode() === '23000' || str_contains($e->getMessage(), 'Duplicate entry');
    }

    /**
     * @param  array<string, mixed>  $config
     */
    private function format(array $config, string $reset, int $year, int $month, int $number): string
    {
        $padded = str_pad((string) $number, (int) ($config['padding'] ?? 6), '0', STR_PAD_LEFT);

        return match ($reset) {
            'monthly' => sprintf('%s-%04d%02d-%s', $config['prefix'], $year, $month, $padded),
            'yearly' => sprintf('%s-%04d-%s', $config['prefix'], $year, $padded),
            default => sprintf('%s-%s', $config['prefix'], $padded),
        };
    }
}
