<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\BusinessRuleException;
use App\Http\Controllers\Controller;
use App\Models\ShippingRate;
use App\Models\ShippingZone;
use App\Models\ShippingZoneArea;
use App\Services\Shipping\ShippingService;
use App\Support\Districts;
use App\Support\Money;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Delivery zones, the areas in them, and what each charges.
 *
 * Zones are never hard-deleted while they still cover an area or carry a
 * rate; deactivating is the way to retire one. A zone id sits on every
 * delivered order, and a report that cannot say where an order went is worse
 * than a tidy list.
 */
class ShippingZoneController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        $zones = ShippingZone::query()
            ->with(['areas:id,shipping_zone_id,district,city', 'rates'])
            ->orderBy('position')
            ->orderBy('id')
            ->get();

        return response()->json([
            'data' => $zones->map(fn (ShippingZone $zone): array => $this->present($zone))->all(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'is_fallback' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);

        $zone = DB::transaction(function () use ($data): ShippingZone {
            $zone = ShippingZone::create($data + [
                'slug' => $this->uniqueSlug($data['name']),
            ]);

            $this->syncFallback($zone);

            return $zone;
        });

        return response()->json(['data' => $this->present($zone->load(['areas', 'rates']))], 201);
    }

    public function update(Request $request, ShippingZone $zone): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'is_fallback' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);

        DB::transaction(function () use ($zone, $data): void {
            $zone->update($data);

            $this->assertFallbackSurvives($zone);
            $this->syncFallback($zone->refresh());
        });

        return response()->json(['data' => $this->present($zone->refresh()->load(['areas', 'rates']))]);
    }

    public function destroy(Request $request, ShippingZone $zone): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        if ($zone->is_fallback) {
            throw new BusinessRuleException(
                'The default delivery zone cannot be deleted. Make another zone the default first.',
                'fallback_zone_required',
            );
        }

        DB::transaction(function () use ($zone): void {
            $zone->areas()->delete();
            $zone->rates()->delete();
            $zone->delete();
        });

        return response()->json(['message' => 'Delivery zone removed.']);
    }

    /**
     * Replace the whole list of places a zone covers.
     *
     * Sent as a set rather than one row at a time, because a district belongs
     * to exactly one zone: moving Gazipur from one zone to another is a single
     * intention, and doing it as add-then-remove leaves a window where it is
     * in both or neither.
     */
    public function syncAreas(Request $request, ShippingZone $zone): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        $data = $request->validate([
            'areas' => ['present', 'array', 'max:200'],

            // A zone may only name a real district. Left free-text, a typo
            // creates an area that matches no address ever entered, and the
            // zone silently covers nothing.
            'areas.*.district' => ['required', 'string', Rule::in(Districts::names())],

            'areas.*.city' => ['nullable', 'string', 'max:100'],
        ]);

        DB::transaction(function () use ($zone, $data): void {
            $zone->areas()->delete();

            foreach ($data['areas'] as $area) {
                // updateOrCreate keyed on the place: if another zone already
                // claims it, this moves it rather than failing on the unique
                // index with an error nobody can act on.
                ShippingZoneArea::updateOrCreate(
                    ['district' => trim($area['district']), 'city' => $area['city'] ? trim($area['city']) : null],
                    ['shipping_zone_id' => $zone->id],
                );
            }
        });

        return response()->json(['data' => $this->present($zone->refresh()->load(['areas', 'rates']))]);
    }

    /**
     * "Where does Gazipur go, and what would it cost?"
     *
     * Zone matching is the part of this screen that goes wrong quietly: a
     * district listed twice, or one nobody listed at all. Both look fine in
     * the editor and only show up as a customer being charged the wrong
     * amount -- or, worse, being unable to check out at all. This answers the
     * question directly, against the same service checkout uses.
     */
    public function test(Request $request): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        /*
         * Free text here, unlike everywhere else.
         *
         * This is a diagnostic: its whole job is to answer "what happens if
         * someone writes Jessore", and restricting it to the canonical list
         * would remove the only way to check that the old spellings still
         * find their zone.
         */
        $data = $request->validate([
            'district' => ['required', 'string', 'max:100'],
            'city' => ['nullable', 'string', 'max:100'],
            'subtotal' => ['sometimes', 'numeric', 'min:0', 'max:99999999'],
            'cod' => ['sometimes', 'boolean'],
        ]);

        $shipping = app(ShippingService::class);
        $subtotal = Money::of((string) ($data['subtotal'] ?? '1000'));

        $zone = $shipping->zoneFor($data['district'], $data['city'] ?? null);

        return response()->json([
            'data' => [
                'zone' => [
                    'id' => $zone->id,
                    'name' => $zone->name,
                    'is_fallback' => $zone->is_fallback,
                ],

                // Said out loud, because "it fell through to the default" is
                // the answer that usually means an area is missing.
                'matched_by' => $zone->is_fallback ? 'default zone' : 'a listed area',

                'subtotal' => $subtotal->value(),
                'options' => $shipping->quote(
                    zone: $zone,
                    subtotal: $subtotal,
                    requiresCod: (bool) ($data['cod'] ?? false),
                ),
            ],
        ]);
    }

    public function storeRate(Request $request, ShippingZone $zone): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);

        $rate = ShippingRate::create($this->rateData($request) + ['shipping_zone_id' => $zone->id]);

        return response()->json(['data' => $this->presentRate($rate)], 201);
    }

    public function updateRate(Request $request, ShippingZone $zone, ShippingRate $rate): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);
        abort_unless($rate->shipping_zone_id === $zone->id, 404);

        $rate->update($this->rateData($request, partial: true));

        return response()->json(['data' => $this->presentRate($rate->refresh())]);
    }

    public function destroyRate(Request $request, ShippingZone $zone, ShippingRate $rate): JsonResponse
    {
        abort_unless($request->user()?->can('shipping.manage'), 403);
        abort_unless($rate->shipping_zone_id === $zone->id, 404);

        if ($zone->rates()->active()->count() <= 1 && $rate->is_active) {
            throw new BusinessRuleException(
                'A zone needs at least one delivery option, or nobody there can check out.',
                'last_rate_in_zone',
            );
        }

        $rate->delete();

        return response()->json(['message' => 'Delivery option removed.']);
    }

    /**
     * @return array<string, mixed>
     */
    private function rateData(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';

        return $request->validate([
            'name' => [$required, 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:255'],
            'base_charge' => [$required, 'numeric', 'min:0', 'max:99999999'],
            'per_kg_charge' => ['sometimes', 'numeric', 'min:0', 'max:99999999'],
            'free_above_subtotal' => ['nullable', 'numeric', 'min:0', 'max:99999999'],
            'min_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'max_days' => ['nullable', 'integer', 'min:0', 'max:365', 'gte:min_days'],
            'supports_cod' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:9999'],
        ]);
    }

    /**
     * Exactly one fallback zone, and it must be active.
     */
    private function syncFallback(ShippingZone $zone): void
    {
        if (! $zone->is_fallback) {
            return;
        }

        ShippingZone::where('id', '!=', $zone->id)
            ->where('is_fallback', true)
            ->update(['is_fallback' => false]);
    }

    /**
     * Refuse to leave the shop with no catch-all zone.
     *
     * Without one, an address in an unlisted district gets no quote and the
     * customer cannot check out -- a lost sale that leaves no trace.
     */
    private function assertFallbackSurvives(ShippingZone $zone): void
    {
        $stillHasOne = ShippingZone::query()
            ->where('is_fallback', true)
            ->where('is_active', true)
            ->exists();

        if (! $stillHasOne) {
            throw new BusinessRuleException(
                'One active zone must be the default, so addresses outside every listed area can still be delivered to.',
                'fallback_zone_required',
                ['shipping_zone_id' => $zone->id],
            );
        }
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'zone';
        $slug = $base;
        $suffix = 2;

        while (ShippingZone::where('slug', $slug)->exists()) {
            $slug = $base.'-'.$suffix++;
        }

        return $slug;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ShippingZone $zone): array
    {
        return [
            'id' => $zone->id,
            'name' => $zone->name,
            'slug' => $zone->slug,
            'description' => $zone->description,
            'is_fallback' => $zone->is_fallback,
            'is_active' => $zone->is_active,
            'position' => $zone->position,
            'areas' => $zone->areas->map(fn (ShippingZoneArea $a): array => [
                'id' => $a->id,
                'district' => $a->district,
                'city' => $a->city,
            ])->all(),
            'rates' => $zone->rates->map(fn (ShippingRate $r): array => $this->presentRate($r))->all(),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function presentRate(ShippingRate $rate): array
    {
        return [
            'id' => $rate->id,
            'shipping_zone_id' => $rate->shipping_zone_id,
            'name' => $rate->name,
            'description' => $rate->description,
            'base_charge' => $rate->base_charge,
            'per_kg_charge' => $rate->per_kg_charge,
            'free_above_subtotal' => $rate->free_above_subtotal,
            'min_days' => $rate->min_days,
            'max_days' => $rate->max_days,
            'estimate' => $rate->estimateLabel(),
            'supports_cod' => $rate->supports_cod,
            'is_active' => $rate->is_active,
            'position' => $rate->position,
        ];
    }
}
