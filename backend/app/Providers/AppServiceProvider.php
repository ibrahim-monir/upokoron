<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\User;
use App\Policies\RolePolicy;
use App\Policies\UserPolicy;
use App\Services\Support\SettingsService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Spatie\Permission\Models\Role;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Settings are read on nearly every request; resolving them once per
        // request keeps that to a single cache hit.
        $this->app->singleton(SettingsService::class);
    }

    public function boot(): void
    {
        $this->configureModels();
        $this->configureRateLimiting();
        $this->configurePolicies();
    }

    private function configureModels(): void
    {
        /*
         * Fail loudly when code touches a relation that was never eager-loaded,
         * or hands Eloquent an attribute that is not fillable.
         *
         * Enabled everywhere EXCEPT production. It deliberately includes the
         * testing environment: gating this on isLocal() alone made the test
         * suite more permissive than the dev server, and a controller passing
         * an unfillable key sailed through every test and then threw a 500 the
         * moment it was called for real.
         *
         * Production stays lenient, because a missing-attribute exception
         * there would take a working page down over a cosmetic field.
         */
        Model::shouldBeStrict(! $this->app->isProduction());

        // Guard against a mass-assignment hole quietly appearing when a model
        // gains a column that nobody added to $fillable.
        Model::unguard(false);
    }

    private function configureRateLimiting(): void
    {
        // Login, registration, and password reset. Tight, and keyed on IP --
        // LoginRequest adds a second limit keyed on the identifier so that
        // one attacker cannot lock out a specific customer.
        RateLimiter::for('auth', fn (Request $request) => [
            Limit::perMinute(10)->by($request->ip()),
            Limit::perDay(100)->by($request->ip()),
        ]);

        // General authenticated API traffic.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(60)
            ->by($request->user()?->id ?: $request->ip()));

        // Public catalogue browsing is read-only and cacheable, so it gets
        // more headroom than write endpoints.
        RateLimiter::for('catalog', fn (Request $request) => Limit::perMinute(120)
            ->by($request->user()?->id ?: $request->ip()));

        // Checkout: expensive, transactional, and a target for stock-probing.
        RateLimiter::for('checkout', fn (Request $request) => Limit::perMinute(10)
            ->by($request->user()?->id ?: $request->ip()));
    }

    private function configurePolicies(): void
    {
        Gate::policy(User::class, UserPolicy::class);

        // Role lives in the package's namespace, so convention-based policy
        // discovery does not find RolePolicy on its own.
        Gate::policy(Role::class, RolePolicy::class);
    }
}
