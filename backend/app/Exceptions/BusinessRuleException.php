<?php

declare(strict_types=1);

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;
use Symfony\Component\HttpFoundation\Response;

/**
 * A request that was well-formed but asked for something the business rules
 * forbid: selling stock that is not there, posting into a closed period,
 * refunding more than was paid.
 *
 * These are 409 Conflict, not 422. 422 means "your input is malformed"; this
 * means "your input is fine, the answer is still no", and the frontend needs
 * to tell those apart to show the right message.
 */
class BusinessRuleException extends RuntimeException
{
    /**
     * @param  array<string, mixed>  $context
     */
    public function __construct(
        string $message,
        protected string $errorCode = 'business_rule_violation',
        protected array $context = [],
        protected int $status = Response::HTTP_CONFLICT,
    ) {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return $this->errorCode;
    }

    /**
     * @return array<string, mixed>
     */
    public function context(): array
    {
        return $this->context;
    }

    public function render(): JsonResponse
    {
        return response()->json(array_filter([
            'message' => $this->getMessage(),
            'code' => $this->errorCode,
            'context' => $this->context ?: null,
        ]), $this->status);
    }
}
