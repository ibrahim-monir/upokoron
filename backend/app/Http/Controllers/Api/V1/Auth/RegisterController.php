<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterRequest;
use App\Services\Auth\AuthSessionIssuer;
use App\Services\Auth\RegistrationService;
use Illuminate\Http\JsonResponse;

class RegisterController extends Controller
{
    public function __construct(
        private readonly RegistrationService $registration,
        private readonly AuthSessionIssuer $issuer,
    ) {}

    public function __invoke(RegisterRequest $request): JsonResponse
    {
        $user = $this->registration->registerCustomer([
            'name' => $request->string('name')->value(),
            'email' => $request->input('email'),
            'phone' => $request->input('phone'),
            'password' => $request->string('password')->value(),
        ]);

        return response()->json($this->issuer->issue($request, $user), 201);
    }
}
