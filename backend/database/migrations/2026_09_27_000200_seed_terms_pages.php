<?php

declare(strict_types=1);

use App\Enums\SettingType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * First Terms & Conditions, in English and Bangla.
 *
 * Every promise in it is one the site already keeps: the 7-day return window
 * (sales.return_window_days), cancelling until the parcel is with the courier
 * (OrderStatus), prices and delivery re-checked at checkout (OrderService),
 * the payment methods the shop offers, and the rewards rules shown on the
 * rewards page. The owner edits it under Admin -> Settings -> Pages.
 *
 * Same rules as the privacy migration: a page is filled only while blank,
 * and the Bangla key gets its public row here.
 */
return new class extends Migration
{
    private const ENGLISH = <<<'TEXT'
Last updated: September 2026

These terms apply to everyone who uses Upokoron.com or buys from it. By browsing the site or placing an order, you agree to them. Please also read our Privacy Policy, which explains how we handle your information.

# 1. About us

Upokoron.com is an online shop in Bangladesh selling electronics, components and accessories. Upokoron.com began trading in 2026 as a new and independent business and has no connection to anyone who ran a business under this name before. Orders, payments, warranties or promises made by any earlier operator are not ours.

# 2. Your account

- You can order as a guest or with an account.
- Please give your real name, a working mobile number and a complete address. We may cancel orders we cannot confirm.
- Keep your password private. You are responsible for what happens under your account.
- We may suspend accounts used for fraud, fake orders or abuse.

# 3. Products and prices

- We try to show every product, picture, specification and price accurately. Colours and small details may look slightly different on your screen.
- Prices are in Bangladeshi Taka (৳). Delivery charges are shown separately at checkout.
- Prices and offers can change without notice. The price you pay is the one shown when you place the order.
- If a product is listed at a clearly wrong price because of a mistake, we will contact you before sending it, and you may cancel for a full refund.

# 4. Orders

- An order is a request to buy. It is accepted once we confirm it, usually by a phone call.
- We may refuse or cancel an order if the product is out of stock, the price was wrong, the address cannot be reached, or the order appears fraudulent. If you have already paid, we will refund you in full.
- Stock is held for you once the order is placed, but can run out in rare cases. If it does, we will tell you and offer an alternative or a refund.

# 5. Payment

We accept:
- Cash on Delivery: pay the delivery person when the parcel arrives
- bKash and Nagad: send the payment and give us the transaction ID so we can confirm it

We will never ask for your bKash or Nagad PIN or OTP. Some payment methods may carry a small extra charge, which is always shown at checkout before you order.

# 6. Delivery

- We deliver across Bangladesh. The charge depends on your district and the delivery option, and is shown before you place the order.
- Some products and orders over a set amount ship free, as shown on the product page and at checkout.
- Delivery times shown are estimates. Delays caused by the courier, weather, holidays or events outside our control can happen.
- Please check your parcel when it arrives. If it is damaged, opened or not what you ordered, tell the delivery person if you can, and contact us within 48 hours with photos.

# 7. Cancelling an order

You can cancel an order from your account or by contacting us at any time until it has been handed to the courier. After that, it can no longer be cancelled, but you may be able to return it (see below). Money you have already paid for a cancelled order is refunded in full.

# 8. Returns and refunds

- You can ask to return a product within 7 days of delivery if it is faulty, damaged, or not what you ordered.
- The product must come back with its box, accessories, manuals and any free items, in the condition you received it.
- We cannot accept returns of products that have been damaged by misuse, wrongly connected or powered, burnt, cut, soldered or physically modified. This includes most electronic components once they have been used in a circuit.
- Once we receive and check the return, we will replace the product or refund you. Refunds go back by bKash, Nagad or another method we agree with you, usually within 7 working days.
- If the return is because of our mistake, we pay the delivery cost. Otherwise, return delivery may be charged to you.

# 9. Warranty

Where a product carries a warranty, its length and terms are shown on the product page. Warranty covers manufacturing faults only, not physical damage, liquid damage, burns, or wrong use. Please keep your invoice or order number, as it is needed for any warranty claim.

# 10. Coupons and reward points

- Coupons have their own conditions, such as minimum order, dates and usage limits, shown when you apply them. They cannot be exchanged for cash.
- Reward points are earned and spent as explained on our Rewards page. They have no cash value, cannot be transferred, and may expire.
- Points or coupons used on an order that is cancelled or returned may not be given back.
- We may change or end these programmes, and may cancel coupons or points gained through misuse.

# 11. Reviews and questions

Reviews and questions you post must be honest and about the product. We may remove anything that is false, offensive, advertising, or contains someone's personal details. By posting, you allow us to show your content on our website.

# 12. Use of the website

Please do not misuse the site: no fake orders, no attempts to break into or overload it, no copying of our content or pictures for commercial use without permission.

# 13. Liability

We are responsible for delivering the products you order as described. We are not responsible for indirect losses, such as lost income or data, and our responsibility for any order is limited to the amount you paid for it. Nothing in these terms takes away your rights under the laws of Bangladesh, including the Consumer Rights Protection Act, 2009.

# 14. Changes to these terms

We may update these terms from time to time. The version on this page when you place an order is the one that applies to that order.

# 15. Law and disputes

These terms are governed by the laws of Bangladesh. If there is a problem, please contact us first and we will do our best to solve it. Any dispute that cannot be settled will be handled by the courts of Dhaka.

# 16. Contact us

- Phone: 01928835756
- Email: info@upokoron.com
TEXT;

    private const BANGLA = <<<'TEXT'
সর্বশেষ হালনাগাদ: সেপ্টেম্বর ২০২৬

Upokoron.com ব্যবহারকারী এবং এখান থেকে কেনাকাটা করা সবার জন্য এই শর্তাবলি প্রযোজ্য। সাইট ব্রাউজ করে বা অর্ডার দিয়ে আপনি এই শর্তাবলিতে সম্মতি দিচ্ছেন। আপনার তথ্য আমরা কীভাবে ব্যবহার করি, তা জানতে আমাদের গোপনীয়তা নীতিও পড়ুন।

# ১. আমাদের সম্পর্কে

Upokoron.com বাংলাদেশের একটি অনলাইন শপ, যেখানে ইলেকট্রনিক্স, কম্পোনেন্ট ও এক্সেসরিজ বিক্রি হয়। Upokoron.com ২০২৬ সাল থেকে সম্পূর্ণ নতুন ও স্বতন্ত্র প্রতিষ্ঠান হিসেবে ব্যবসা শুরু করেছে। এই নামে আগে যাঁরা ব্যবসা পরিচালনা করেছেন, তাঁদের সঙ্গে আমাদের কোনো সম্পর্ক নেই। পূর্ববর্তী কোনো পরিচালকের নেওয়া অর্ডার, পেমেন্ট, ওয়ারেন্টি বা প্রতিশ্রুতির দায় আমাদের নয়।

# ২. আপনার একাউন্ট

- একাউন্ট ছাড়াও (গেস্ট হিসেবে) বা একাউন্ট খুলে অর্ডার করতে পারবেন।
- আপনার আসল নাম, সচল মোবাইল নম্বর ও পূর্ণ ঠিকানা দিন। যে অর্ডার নিশ্চিত করা যায় না, তা আমরা বাতিল করতে পারি।
- পাসওয়ার্ড গোপন রাখুন। আপনার একাউন্ট থেকে যা হয়, তার দায় আপনার।
- প্রতারণা, ভুয়া অর্ডার বা অপব্যবহারের জন্য ব্যবহৃত একাউন্ট আমরা বন্ধ করতে পারি।

# ৩. পণ্য ও দাম

- প্রতিটি পণ্য, ছবি, বিবরণ ও দাম সঠিকভাবে দেখানোর চেষ্টা করি। আপনার স্ক্রিনে রং ও ছোটখাটো খুঁটিনাটি সামান্য ভিন্ন দেখাতে পারে।
- দাম বাংলাদেশি টাকায় (৳)। ডেলিভারি চার্জ চেকআউটে আলাদাভাবে দেখানো হয়।
- দাম ও অফার আগাম নোটিশ ছাড়াই বদলাতে পারে। অর্ডার দেওয়ার সময় যে দাম দেখানো হয়, সেটিই আপনি পরিশোধ করবেন।
- ভুলবশত কোনো পণ্যের দাম স্পষ্টতই ভুল দেখানো হলে, পাঠানোর আগে আমরা আপনার সঙ্গে যোগাযোগ করব, এবং আপনি চাইলে অর্ডার বাতিল করে পুরো টাকা ফেরত পাবেন।

# ৪. অর্ডার

- অর্ডার হলো কেনার অনুরোধ। আমরা নিশ্চিত করলে (সাধারণত ফোন করে) অর্ডারটি গৃহীত হয়।
- পণ্য স্টকে না থাকলে, দাম ভুল হলে, ঠিকানায় পৌঁছানো না গেলে বা অর্ডারটি প্রতারণামূলক মনে হলে আমরা তা গ্রহণ না করতে বা বাতিল করতে পারি। আগে পেমেন্ট করে থাকলে পুরো টাকা ফেরত দেওয়া হবে।
- অর্ডার দেওয়ার পর স্টক আপনার জন্য রাখা হয়, তবে বিরল ক্ষেত্রে শেষ হয়ে যেতে পারে। তেমন হলে আমরা আপনাকে জানাব এবং বিকল্প পণ্য বা টাকা ফেরতের প্রস্তাব দেব।

# ৫. পেমেন্ট

আমরা গ্রহণ করি:
- ক্যাশ অন ডেলিভারি: পার্সেল পৌঁছালে ডেলিভারিম্যানকে টাকা দিন
- বিকাশ ও নগদ: টাকা পাঠিয়ে ট্রানজেকশন আইডি দিন, যাতে আমরা পেমেন্ট নিশ্চিত করতে পারি

আমরা কখনো আপনার বিকাশ বা নগদের পিন বা ওটিপি চাই না। কিছু পেমেন্ট পদ্ধতিতে সামান্য অতিরিক্ত চার্জ থাকতে পারে, যা অর্ডার দেওয়ার আগে চেকআউটে সবসময় দেখানো হয়।

# ৬. ডেলিভারি

- আমরা সারা বাংলাদেশে ডেলিভারি দিই। চার্জ নির্ভর করে আপনার জেলা ও ডেলিভারি অপশনের ওপর, এবং অর্ডার দেওয়ার আগেই তা দেখানো হয়।
- কিছু পণ্যে এবং নির্দিষ্ট পরিমাণের বেশি অর্ডারে ডেলিভারি ফ্রি, যা পণ্যের পেজে ও চেকআউটে দেখানো হয়।
- দেখানো ডেলিভারি সময় আনুমানিক। কুরিয়ার, আবহাওয়া, ছুটি বা আমাদের নিয়ন্ত্রণের বাইরের কারণে দেরি হতে পারে।
- পার্সেল হাতে পেয়ে দেখে নিন। ক্ষতিগ্রস্ত, খোলা বা ভুল পণ্য হলে সম্ভব হলে ডেলিভারিম্যানকে জানান এবং ৪৮ ঘণ্টার মধ্যে ছবিসহ আমাদের সঙ্গে যোগাযোগ করুন।

# ৭. অর্ডার বাতিল

কুরিয়ারের কাছে হস্তান্তরের আগ পর্যন্ত যেকোনো সময় একাউন্ট থেকে বা আমাদের সঙ্গে যোগাযোগ করে অর্ডার বাতিল করতে পারবেন। এরপর আর বাতিল করা যাবে না, তবে ফেরত দেওয়া যেতে পারে (নিচে দেখুন)। বাতিল অর্ডারে আগে পরিশোধ করা টাকা পুরোটা ফেরত দেওয়া হবে।

# ৮. রিটার্ন ও রিফান্ড

- পণ্য ত্রুটিপূর্ণ, ক্ষতিগ্রস্ত বা অর্ডারের সঙ্গে না মিললে ডেলিভারির ৭ দিনের মধ্যে ফেরত দেওয়ার অনুরোধ করতে পারবেন।
- পণ্যটি বক্স, এক্সেসরিজ, ম্যানুয়াল ও ফ্রি উপহারসহ, যে অবস্থায় পেয়েছিলেন সেই অবস্থায় ফেরত দিতে হবে।
- ভুল ব্যবহার, ভুল সংযোগ বা ভুল পাওয়ার দেওয়া, পুড়ে যাওয়া, কাটা, সোল্ডার করা বা পরিবর্তন করা পণ্য ফেরত নেওয়া হয় না। সার্কিটে একবার ব্যবহার করা বেশিরভাগ ইলেকট্রনিক কম্পোনেন্টও এর মধ্যে পড়ে।
- ফেরত পণ্য হাতে পেয়ে যাচাইয়ের পর আমরা পণ্য বদলে দেব বা টাকা ফেরত দেব। রিফান্ড বিকাশ, নগদ বা আপনার সঙ্গে ঠিক করা অন্য মাধ্যমে, সাধারণত ৭ কর্মদিবসের মধ্যে দেওয়া হয়।
- আমাদের ভুলের কারণে ফেরত দিলে ডেলিভারি খরচ আমরা বহন করব। অন্য ক্ষেত্রে ফেরতের ডেলিভারি খরচ আপনাকে দিতে হতে পারে।

# ৯. ওয়ারেন্টি

যে পণ্যে ওয়ারেন্টি আছে, তার মেয়াদ ও শর্ত পণ্যের পেজে দেখানো থাকে। ওয়ারেন্টি শুধু উৎপাদনজনিত ত্রুটির জন্য প্রযোজ্য; ভেঙে যাওয়া, পানিতে নষ্ট হওয়া, পুড়ে যাওয়া বা ভুল ব্যবহারের জন্য নয়। ওয়ারেন্টি দাবির জন্য আপনার ইনভয়েস বা অর্ডার নম্বর সংরক্ষণ করুন।

# ১০. কুপন ও রিওয়ার্ড পয়েন্ট

- প্রতিটি কুপনের নিজস্ব শর্ত আছে, যেমন সর্বনিম্ন অর্ডার, মেয়াদ ও ব্যবহারের সীমা, যা প্রয়োগের সময় দেখানো হয়। কুপন নগদ টাকায় বদলানো যায় না।
- রিওয়ার্ড পয়েন্ট আমাদের রিওয়ার্ড পেজে বর্ণিত নিয়মে অর্জন ও খরচ করা যায়। পয়েন্টের কোনো নগদ মূল্য নেই, হস্তান্তরযোগ্য নয় এবং মেয়াদ শেষ হতে পারে।
- বাতিল বা ফেরত দেওয়া অর্ডারে ব্যবহৃত পয়েন্ট বা কুপন ফেরত নাও দেওয়া হতে পারে।
- আমরা এই সুবিধাগুলো পরিবর্তন বা বন্ধ করতে পারি, এবং অপব্যবহারের মাধ্যমে পাওয়া কুপন বা পয়েন্ট বাতিল করতে পারি।

# ১১. রিভিউ ও প্রশ্ন

আপনার দেওয়া রিভিউ ও প্রশ্ন সৎ ও পণ্য-সংক্রান্ত হতে হবে। মিথ্যা, আপত্তিকর, বিজ্ঞাপন বা কারো ব্যক্তিগত তথ্যসংবলিত কিছু আমরা সরিয়ে ফেলতে পারি। পোস্ট করার মাধ্যমে আপনি আমাদের ওয়েবসাইটে তা দেখানোর অনুমতি দিচ্ছেন।

# ১২. ওয়েবসাইট ব্যবহার

দয়া করে সাইটের অপব্যবহার করবেন না: ভুয়া অর্ডার দেওয়া, সাইটে অনুপ্রবেশ বা অতিরিক্ত চাপ সৃষ্টির চেষ্টা, কিংবা অনুমতি ছাড়া বাণিজ্যিক কাজে আমাদের লেখা বা ছবি কপি করা যাবে না।

# ১৩. দায়বদ্ধতা

বর্ণনা অনুযায়ী আপনার অর্ডার করা পণ্য পৌঁছে দেওয়ার দায়িত্ব আমাদের। পরোক্ষ ক্ষতি, যেমন আয় বা ডেটা হারানোর দায় আমাদের নয়, এবং কোনো অর্ডারের ক্ষেত্রে আমাদের দায় সেই অর্ডারে আপনার পরিশোধিত টাকার মধ্যে সীমাবদ্ধ। এই শর্তাবলির কোনো কিছুই বাংলাদেশের আইন, যেমন ভোক্তা-অধিকার সংরক্ষণ আইন, ২০০৯-এর অধীনে আপনার অধিকার খর্ব করে না।

# ১৪. শর্তাবলির পরিবর্তন

আমরা সময়ে সময়ে এই শর্তাবলি হালনাগাদ করতে পারি। অর্ডার দেওয়ার সময় এই পেজে যে সংস্করণ থাকে, সেই অর্ডারে সেটিই প্রযোজ্য।

# ১৫. আইন ও বিরোধ

এই শর্তাবলি বাংলাদেশের আইন দ্বারা পরিচালিত। কোনো সমস্যা হলে প্রথমে আমাদের সঙ্গে যোগাযোগ করুন, আমরা সমাধানের সর্বোচ্চ চেষ্টা করব। মীমাংসা না হওয়া বিরোধ ঢাকার আদালতে নিষ্পত্তি হবে।

# ১৬. যোগাযোগ

- ফোন: 01928835756
- ইমেইল: info@upokoron.com
TEXT;

    public function up(): void
    {
        $this->fill('page_terms', 'Terms & Conditions', self::ENGLISH);
        $this->fill('page_terms_bangla', 'Terms & Conditions (Bangla)', self::BANGLA);

        cache()->forget('upokoron.settings');
    }

    public function down(): void
    {
        DB::table('settings')->where('key', 'page_terms_bangla')->delete();
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
