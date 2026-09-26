<?php

declare(strict_types=1);

use App\Enums\SettingType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A first privacy policy, in English and Bangla.
 *
 * Written from what this shop actually does -- what the checkout, accounts,
 * rewards, reviews, contact form and WhatsApp chat store, who an order is
 * passed to, and that Google Analytics runs only when the owner sets an ID.
 * The owner edits it under Admin -> Settings -> Pages.
 *
 * Fills a page only while it is still blank: text the owner has already
 * written is never overwritten. The Bangla key is new, so its row is created
 * here -- deploys run migrate, not db:seed, and the storefront only sees a
 * setting whose row is marked public.
 *
 * Format: blank lines separate paragraphs, "# " starts a heading and "- " a
 * bullet (see ContentPage).
 */
return new class extends Migration
{
    private const ENGLISH = <<<'TEXT'
Last updated: September 2026

Upokoron.com ("we", "us") sells electronics and accessories online in Bangladesh. This policy explains what information we collect when you use our website, why we need it, who we share it with, and the choices you have. By using Upokoron.com you agree to this policy.

# 1. Information we collect

When you place an order:
- Your name, mobile number and delivery address (address, area, city and district)
- An email address, if you give one
- What you ordered, the price, the delivery option and the payment method
- For bKash or Nagad, the transaction ID you send us so we can match your payment

When you create an account:
- Your name, mobile number, email address and a password. Your password is stored in encrypted form; we cannot see it.
- Saved delivery addresses, your order history and your wishlist
- Your birthday, if you add it, so we can give you birthday reward points

When you contact us or take part:
- Messages you send through the contact form or on WhatsApp
- Product reviews and questions you post. Your name is shown next to them publicly.
- Reward points you earn and spend

Automatically:
- A cart code and login session stored in your browser, so your cart and sign-in keep working
- Your language choice (English or Bangla)
- If we have turned on Google Analytics: pages visited, device and browser type, and approximate location. This is used only to understand how the site is used.

We do not collect card numbers. We do not ask for your bKash or Nagad PIN, and we never will. Anyone asking for your PIN in our name is not us.

# 2. How we use it

- To confirm, pack, deliver and support your order, including calling you to confirm it
- To record payments and handle returns and refunds
- To run your account, rewards points and wishlist
- To answer your messages and questions
- To keep the site secure and prevent fraud and fake orders
- To keep business and accounting records as the law requires
- To improve the website and the products we stock

We do not sell or rent your personal information to anyone.

# 3. Who we share it with

Only as much as each needs, and only for your order:
- Delivery couriers receive your name, mobile number, address and the amount to collect, so they can deliver your parcel
- bKash and Nagad process payments you make to us under their own privacy policies
- WhatsApp (Meta) carries the messages you send us there
- Google Analytics, if turned on, receives anonymous usage data
- Government or law enforcement authorities, where Bangladeshi law requires it

# 4. How long we keep it

Order and payment records are kept for as long as the law requires for business and tax records. Account information is kept while your account exists. Messages are kept as long as needed to deal with them.

# 5. Your choices

- You can see and update your name, phone number, addresses and birthday from My Account.
- You can ask us for a copy of your information, or ask us to correct or delete it. Order records we are required by law to keep will be kept, but removed from your account.
- You can clear the site's data from your browser at any time. Your cart will then be emptied.

# 6. Security

We use HTTPS encryption across the whole website, store passwords in encrypted form, and limit staff access to what each person needs for their job. No website can be perfectly secure, so please keep your password private and let us know at once if you think your account has been misused.

# 7. Children

Our website is not meant for children under 13, and we do not knowingly collect their information.

# 8. Changes to this policy

We may update this policy from time to time. The latest version is always on this page, with the date it was last updated at the top.

# 9. Contact us

For any question about your information or this policy:
- Phone: 01928835756
- Email: info@upokoron.com
TEXT;

    private const BANGLA = <<<'TEXT'
সর্বশেষ হালনাগাদ: সেপ্টেম্বর ২০২৬

Upokoron.com ("আমরা") বাংলাদেশে অনলাইনে ইলেকট্রনিক্স ও এক্সেসরিজ বিক্রি করে। আমাদের ওয়েবসাইট ব্যবহারের সময় আমরা কী তথ্য সংগ্রহ করি, কেন করি, কার সঙ্গে শেয়ার করি এবং এ বিষয়ে আপনার কী করণীয় আছে — এই নীতিতে তা ব্যাখ্যা করা হয়েছে। Upokoron.com ব্যবহার করার মাধ্যমে আপনি এই নীতিতে সম্মতি দিচ্ছেন।

# ১. আমরা যে তথ্য সংগ্রহ করি

অর্ডার করার সময়:
- আপনার নাম, মোবাইল নম্বর ও ডেলিভারি ঠিকানা (ঠিকানা, এলাকা, শহর ও জেলা)
- ইমেইল ঠিকানা, যদি দেন
- কী অর্ডার করেছেন, দাম, ডেলিভারি অপশন ও পেমেন্ট পদ্ধতি
- বিকাশ বা নগদে পেমেন্ট করলে, পেমেন্ট মেলানোর জন্য আপনার পাঠানো ট্রানজেকশন আইডি

একাউন্ট খুললে:
- আপনার নাম, মোবাইল নম্বর, ইমেইল ও পাসওয়ার্ড। পাসওয়ার্ড এনক্রিপ্ট করে রাখা হয়; আমরা তা দেখতে পাই না।
- সংরক্ষিত ডেলিভারি ঠিকানা, অর্ডারের ইতিহাস ও পছন্দের তালিকা
- আপনার জন্মদিন, যদি যোগ করেন — জন্মদিনে রিওয়ার্ড পয়েন্ট দেওয়ার জন্য

যোগাযোগ বা অংশগ্রহণ করলে:
- কন্টাক্ট ফর্ম বা হোয়াটসঅ্যাপে পাঠানো বার্তা
- পণ্যের রিভিউ ও প্রশ্ন। এগুলোর পাশে আপনার নাম সবার জন্য দেখানো হয়।
- অর্জিত ও খরচ করা রিওয়ার্ড পয়েন্ট

স্বয়ংক্রিয়ভাবে:
- আপনার ব্রাউজারে একটি কার্ট কোড ও লগইন সেশন, যাতে কার্ট ও সাইন-ইন ঠিকমতো কাজ করে
- আপনার বেছে নেওয়া ভাষা (বাংলা বা ইংরেজি)
- গুগল অ্যানালিটিক্স চালু থাকলে: কোন পেজ দেখা হয়েছে, ডিভাইস ও ব্রাউজারের ধরন এবং আনুমানিক অবস্থান। এটি শুধু সাইট কীভাবে ব্যবহার হচ্ছে তা বোঝার জন্য।

আমরা কার্ড নম্বর সংগ্রহ করি না। আমরা কখনো আপনার বিকাশ বা নগদের পিন চাই না, চাইবও না। আমাদের নামে কেউ পিন চাইলে সে আমরা নই।

# ২. তথ্য যেভাবে ব্যবহার করি

- আপনার অর্ডার নিশ্চিত, প্যাক, ডেলিভারি ও সহায়তা করতে — অর্ডার নিশ্চিত করতে ফোন করাসহ
- পেমেন্ট রেকর্ড করতে এবং রিটার্ন ও রিফান্ড দিতে
- আপনার একাউন্ট, রিওয়ার্ড পয়েন্ট ও পছন্দের তালিকা চালাতে
- আপনার বার্তা ও প্রশ্নের উত্তর দিতে
- সাইট নিরাপদ রাখতে এবং প্রতারণা ও ভুয়া অর্ডার ঠেকাতে
- আইন অনুযায়ী ব্যবসা ও হিসাবের রেকর্ড রাখতে
- ওয়েবসাইট ও পণ্যের মান উন্নত করতে

আমরা আপনার ব্যক্তিগত তথ্য কারো কাছে বিক্রি বা ভাড়া দিই না।

# ৩. যাদের সঙ্গে তথ্য শেয়ার করা হয়

শুধু আপনার অর্ডারের জন্য, যার যতটুকু দরকার ততটুকুই:
- ডেলিভারি কুরিয়ার পায় আপনার নাম, মোবাইল নম্বর, ঠিকানা ও আদায়যোগ্য টাকার পরিমাণ — পার্সেল পৌঁছে দেওয়ার জন্য
- বিকাশ ও নগদ তাদের নিজস্ব গোপনীয়তা নীতি অনুযায়ী আপনার পেমেন্ট প্রক্রিয়া করে
- হোয়াটসঅ্যাপ (মেটা) সেখানে পাঠানো আপনার বার্তা বহন করে
- গুগল অ্যানালিটিক্স চালু থাকলে নাম-পরিচয়হীন ব্যবহারের তথ্য পায়
- বাংলাদেশের আইন অনুযায়ী প্রয়োজন হলে সরকারি বা আইনশৃঙ্খলা রক্ষাকারী কর্তৃপক্ষ

# ৪. তথ্য কতদিন রাখা হয়

অর্ডার ও পেমেন্টের রেকর্ড ব্যবসা ও করের হিসাবের জন্য আইনে যতদিন প্রয়োজন ততদিন রাখা হয়। একাউন্টের তথ্য একাউন্ট থাকা পর্যন্ত রাখা হয়। বার্তা রাখা হয় যতদিন সেগুলোর সমাধানে প্রয়োজন।

# ৫. আপনার করণীয়

- "আমার একাউন্ট" থেকে আপনার নাম, ফোন নম্বর, ঠিকানা ও জন্মদিন দেখতে ও বদলাতে পারবেন।
- আপনার তথ্যের একটি কপি চাইতে, অথবা তা সংশোধন বা মুছে ফেলতে বলতে পারবেন। আইন অনুযায়ী যে অর্ডার রেকর্ড রাখতে হয় তা রাখা হবে, তবে আপনার একাউন্ট থেকে সরিয়ে দেওয়া হবে।
- যেকোনো সময় ব্রাউজার থেকে এই সাইটের ডেটা মুছে ফেলতে পারবেন। তাতে আপনার কার্ট খালি হয়ে যাবে।

# ৬. নিরাপত্তা

পুরো ওয়েবসাইটে আমরা HTTPS এনক্রিপশন ব্যবহার করি, পাসওয়ার্ড এনক্রিপ্ট করে রাখি এবং কর্মীদের শুধু তাদের কাজের জন্য প্রয়োজনীয় তথ্য দেখার সুযোগ দিই। কোনো ওয়েবসাইটই শতভাগ নিরাপদ নয়, তাই আপনার পাসওয়ার্ড গোপন রাখুন এবং একাউন্টের অপব্যবহার হয়েছে মনে হলে সঙ্গে সঙ্গে আমাদের জানান।

# ৭. শিশু

আমাদের ওয়েবসাইট ১৩ বছরের কম বয়সী শিশুদের জন্য নয় এবং আমরা জেনেশুনে তাদের তথ্য সংগ্রহ করি না।

# ৮. এই নীতির পরিবর্তন

আমরা সময়ে সময়ে এই নীতি হালনাগাদ করতে পারি। সর্বশেষ সংস্করণ সবসময় এই পেজে থাকবে, আর উপরে লেখা থাকবে কবে শেষ হালনাগাদ হয়েছে।

# ৯. যোগাযোগ

আপনার তথ্য বা এই নীতি নিয়ে যেকোনো প্রশ্নে:
- ফোন: 01928835756
- ইমেইল: info@upokoron.com
TEXT;

    public function up(): void
    {
        $this->fill('page_privacy', 'Privacy Policy', self::ENGLISH);
        $this->fill('page_privacy_bangla', 'Privacy Policy (Bangla)', self::BANGLA);

        // The settings service caches the whole table.
        cache()->forget('upokoron.settings');
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'page_privacy_bangla')->delete();
    }

    private function fill(string $key, string $label, string $text): void
    {
        $row = DB::table('settings')->where('key', $key)->first();

        if ($row === null) {
            DB::table('settings')->insert([
                'key' => $key,
                'group' => 'pages',
                'value' => SettingType::String->serialize($text),
                'type' => SettingType::String->value,
                'is_public' => true,
                'label' => $label,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return;
        }

        // Never overwrite what the owner has written.
        if (trim((string) SettingType::String->cast($row->value)) !== '') {
            return;
        }

        DB::table('settings')->where('key', $key)->update([
            'value' => SettingType::String->serialize($text),
            'updated_at' => now(),
        ]);
    }
};
