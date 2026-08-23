<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            // Denormalised cache, kept in step with reward_point_transactions
            // by RewardPointsService. The transaction table is the source of
            // truth; this column exists so a balance check never has to sum
            // a customer's whole point history.
            $table->integer('reward_points_balance')->default(0)->after('total_spent');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table): void {
            $table->dropColumn('reward_points_balance');
        });
    }
};
