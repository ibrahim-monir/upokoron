<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Services\Support\SettingsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    public function __construct(private readonly SettingsService $settings) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorizePermission('settings.manage');

        $group = $request->string('group')->value();

        return response()->json([
            'data' => $group !== '' ? $this->settings->group($group) : $this->settings->all(),
            'groups' => array_keys(config('upokoron.settings', [])),
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->authorizePermission('settings.manage');

        // Only keys declared in config may be written. Without this an
        // attacker could stuff arbitrary rows into the settings table and,
        // worse, shadow a key the application later starts reading.
        $known = array_keys($this->knownDefaults());

        $validated = $request->validate([
            'settings' => ['required', 'array', 'min:1'],
            'settings.*' => ['nullable'],
        ]);

        $unknown = array_diff(array_keys($validated['settings']), $known);

        if ($unknown !== []) {
            return response()->json([
                'message' => 'Unknown setting keys.',
                'errors' => ['settings' => array_values($unknown)],
            ], 422);
        }

        $this->settings->setMany($validated['settings']);

        return response()->json([
            'message' => 'Settings saved.',
            'data' => $this->settings->all(),
        ]);
    }

    /**
     * Settings the storefront may read without authenticating.
     */
    public function publicSettings(): JsonResponse
    {
        return response()->json([
            'data' => $this->settings->publicSettings() + [
                'currency_code' => config('upokoron.currency.code'),
                'currency_symbol' => config('upokoron.currency.symbol'),
                'timezone' => config('upokoron.display_timezone'),
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function knownDefaults(): array
    {
        $flat = [];

        foreach (config('upokoron.settings', []) as $keys) {
            foreach ($keys as $key => $default) {
                $flat[$key] = $default;
            }
        }

        return $flat;
    }

    private function authorizePermission(string $permission): void
    {
        abort_unless(request()->user()?->can($permission), 403, 'You do not have permission to do that.');
    }
}
