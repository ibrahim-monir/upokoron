<?php

declare(strict_types=1);

namespace App\Support;

/**
 * The 64 districts of Bangladesh, by division.
 *
 * One list, served to the storefront and used for validation, so a delivery
 * zone can never name a district that no address form will ever produce. The
 * shop delivers only inside Bangladesh, so the country is a constant rather
 * than a field anybody has to fill in or get wrong.
 *
 * Spellings are the current official ones. Several districts were renamed --
 * Jessore became Jashore, Comilla became Cumilla -- and both spellings are
 * still in daily use, so ALIASES maps the old ones onto the new. Without
 * that, an address typed the way half the country still writes it matches no
 * zone and falls through to the most expensive delivery charge.
 */
final class Districts
{
    public const COUNTRY = 'BD';

    public const COUNTRY_NAME = 'Bangladesh';

    /** @var array<string, array<int, string>> */
    private const BY_DIVISION = [
        'Barishal' => [
            'Barguna', 'Barishal', 'Bhola', 'Jhalokati', 'Patuakhali', 'Pirojpur',
        ],
        'Chattogram' => [
            'Bandarban', 'Brahmanbaria', 'Chandpur', 'Chattogram', 'Cumilla',
            "Cox's Bazar", 'Feni', 'Khagrachhari', 'Lakshmipur', 'Noakhali', 'Rangamati',
        ],
        'Dhaka' => [
            'Dhaka', 'Faridpur', 'Gazipur', 'Gopalganj', 'Kishoreganj', 'Madaripur',
            'Manikganj', 'Munshiganj', 'Narayanganj', 'Narsingdi', 'Rajbari',
            'Shariatpur', 'Tangail',
        ],
        'Khulna' => [
            'Bagerhat', 'Chuadanga', 'Jashore', 'Jhenaidah', 'Khulna', 'Kushtia',
            'Magura', 'Meherpur', 'Narail', 'Satkhira',
        ],
        'Mymensingh' => [
            'Jamalpur', 'Mymensingh', 'Netrokona', 'Sherpur',
        ],
        'Rajshahi' => [
            'Bogura', 'Chapainawabganj', 'Joypurhat', 'Naogaon', 'Natore',
            'Pabna', 'Rajshahi', 'Sirajganj',
        ],
        'Rangpur' => [
            'Dinajpur', 'Gaibandha', 'Kurigram', 'Lalmonirhat', 'Nilphamari',
            'Panchagarh', 'Rangpur', 'Thakurgaon',
        ],
        'Sylhet' => [
            'Habiganj', 'Moulvibazar', 'Sunamganj', 'Sylhet',
        ],
    ];

    /**
     * Former and common alternate spellings, lowercased, mapped to the
     * current official name.
     *
     * @var array<string, string>
     */
    private const ALIASES = [
        'barisal' => 'Barishal',
        'bogra' => 'Bogura',
        'chittagong' => 'Chattogram',
        'comilla' => 'Cumilla',
        'coxs bazar' => "Cox's Bazar",
        'cox bazar' => "Cox's Bazar",
        'coxsbazar' => "Cox's Bazar",
        'jessore' => 'Jashore',
        'jhenidah' => 'Jhenaidah',
        'moulavibazar' => 'Moulvibazar',
        'maulvibazar' => 'Moulvibazar',
        'nawabganj' => 'Chapainawabganj',
        'chapai nawabganj' => 'Chapainawabganj',
        'netrakona' => 'Netrokona',
        'brahminbaria' => 'Brahmanbaria',
        'khagrachari' => 'Khagrachhari',
    ];

    /**
     * Every district name, alphabetical.
     *
     * @return array<int, string>
     */
    public static function names(): array
    {
        static $names = null;

        if ($names === null) {
            $names = array_merge(...array_values(self::BY_DIVISION));
            sort($names);
        }

        return $names;
    }

    /**
     * Grouped by division, for a dropdown with optgroups.
     *
     * @return array<string, array<int, string>>
     */
    public static function byDivision(): array
    {
        return self::BY_DIVISION;
    }

    /**
     * The official spelling of whatever the caller wrote, or null if it is
     * not a Bangladeshi district at all.
     */
    public static function normalise(?string $name): ?string
    {
        $name = trim((string) $name);

        if ($name === '') {
            return null;
        }

        $key = mb_strtolower($name);

        if (isset(self::ALIASES[$key])) {
            return self::ALIASES[$key];
        }

        foreach (self::names() as $district) {
            if (mb_strtolower($district) === $key) {
                return $district;
            }
        }

        return null;
    }

    public static function isValid(?string $name): bool
    {
        return self::normalise($name) !== null;
    }
}
