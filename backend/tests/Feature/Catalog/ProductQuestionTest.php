<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Enums\QuestionStatus;
use App\Models\Customer;
use App\Models\Product;
use App\Models\ProductQuestion;
use App\Models\User;
use Database\Seeders\UnitSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Product Q&A.
 *
 * The two rules that define the feature: anyone may ask, with or without an
 * account, and only staff may answer. Everything else here exists to make
 * the first rule safe -- nothing a stranger types is public until someone
 * with the permission has looked at it.
 */
class ProductQuestionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(UnitSeeder::class);
    }

    private function product(): Product
    {
        return Product::factory()->create();
    }

    public function test_a_guest_can_ask_a_question_without_signing_in(): void
    {
        $product = $this->product();

        $this->postJson("/api/v1/shop/products/{$product->slug}/questions", [
            'asker_name' => 'Rahim Uddin',
            'question' => 'Does this run on a 12V supply?',
        ])->assertCreated();

        $this->assertDatabaseHas('product_questions', [
            'product_id' => $product->id,
            'customer_id' => null,
            'asker_name' => 'Rahim Uddin',
            'status' => QuestionStatus::Pending->value,
        ]);
    }

    public function test_a_guest_must_give_a_name(): void
    {
        $product = $this->product();

        $this->postJson("/api/v1/shop/products/{$product->slug}/questions", [
            'question' => 'Does this run on a 12V supply?',
        ])->assertStatus(422)->assertJsonValidationErrors('asker_name');
    }

    public function test_a_signed_in_customer_need_not_retype_their_name(): void
    {
        $product = $this->product();
        $user = User::factory()->role('customer')->create();
        $customer = Customer::factory()->create(['user_id' => $user->id, 'name' => 'Karim Ali']);

        $this->actingAs($user)
            ->postJson("/api/v1/shop/products/{$product->slug}/questions", [
                'question' => 'Is the connector included in the box?',
            ])->assertCreated();

        $this->assertDatabaseHas('product_questions', [
            'customer_id' => $customer->id,
            'asker_name' => 'Karim Ali',
        ]);
    }

    public function test_a_pending_question_is_not_public(): void
    {
        $product = $this->product();

        ProductQuestion::create([
            'product_id' => $product->id,
            'asker_name' => 'Spam Bot',
            'question' => 'Buy cheap watches at this link',
            'status' => QuestionStatus::Pending->value,
        ]);

        $this->getJson("/api/v1/shop/products/{$product->slug}/questions")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_the_public_list_shows_approved_questions_and_hides_the_asker_email(): void
    {
        $product = $this->product();

        ProductQuestion::create([
            'product_id' => $product->id,
            'asker_name' => 'Rahim Uddin',
            'asker_email' => 'rahim@example.com',
            'question' => 'Does this run on a 12V supply?',
            'answer' => 'Yes, 9V to 15V is fine.',
            'answered_at' => now(),
            'status' => QuestionStatus::Approved->value,
        ]);

        $response = $this->getJson("/api/v1/shop/products/{$product->slug}/questions")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.answer', 'Yes, 9V to 15V is fine.');

        $this->assertArrayNotHasKey('asker_email', $response->json('data.0'));
    }

    public function test_a_customer_cannot_answer_a_question(): void
    {
        $question = $this->pendingQuestion();
        $user = User::factory()->role('customer')->create();

        $this->actingAs($user)
            ->putJson("/api/v1/admin/questions/{$question->id}/answer", ['answer' => 'Sure, buy from me instead.'])
            ->assertForbidden();

        $this->assertNull($question->refresh()->answer);
    }

    public function test_staff_without_the_permission_cannot_answer(): void
    {
        $question = $this->pendingQuestion();

        // Stock manager runs the warehouse; talking to customers is not
        // their job, and the role list does not give them the permission.
        $user = User::factory()->role('stock_manager')->create();

        $this->actingAs($user)
            ->putJson("/api/v1/admin/questions/{$question->id}/answer", ['answer' => 'Yes.'])
            ->assertForbidden();
    }

    public function test_a_manager_answering_publishes_the_question(): void
    {
        $question = $this->pendingQuestion();
        $manager = User::factory()->role('manager')->create();

        $this->actingAs($manager)
            ->putJson("/api/v1/admin/questions/{$question->id}/answer", [
                'answer' => 'Yes, 9V to 15V is fine.',
            ])->assertOk();

        $question->refresh();

        $this->assertSame('Yes, 9V to 15V is fine.', $question->answer);
        $this->assertSame($manager->id, $question->answered_by);
        $this->assertNotNull($question->answered_at);

        // Replying is approving -- see the admin controller's class comment.
        $this->assertSame(QuestionStatus::Approved, $question->status);

        $this->getJson("/api/v1/shop/products/{$question->product->slug}/questions")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_a_manager_can_hide_a_question_without_answering_it(): void
    {
        $question = $this->pendingQuestion();
        $manager = User::factory()->role('manager')->create();

        $this->actingAs($manager)
            ->putJson("/api/v1/admin/questions/{$question->id}/status", ['status' => 'rejected'])
            ->assertOk();

        $this->assertSame(QuestionStatus::Rejected, $question->refresh()->status);

        $this->getJson("/api/v1/shop/products/{$question->product->slug}/questions")
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_the_panel_counts_what_is_still_waiting_on_a_reply(): void
    {
        $this->pendingQuestion();
        $manager = User::factory()->role('manager')->create();

        $this->actingAs($manager)
            ->getJson('/api/v1/admin/questions')
            ->assertOk()
            ->assertJsonPath('summary.unanswered', 1)
            ->assertJsonPath('summary.by_status.pending.count', 1);
    }

    private function pendingQuestion(): ProductQuestion
    {
        return ProductQuestion::create([
            'product_id' => $this->product()->id,
            'asker_name' => 'Rahim Uddin',
            'question' => 'Does this run on a 12V supply?',
            'status' => QuestionStatus::Pending->value,
        ]);
    }
}
