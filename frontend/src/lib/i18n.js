import { useLocaleStore } from '../stores/localeStore'

/*
 * Storefront UI chrome, in English and Bangla. Deliberately not product
 * data (names, descriptions) -- those are the owner's own words, entered
 * once in whichever language they wrote the catalogue in, and there is no
 * honest machine translation of somebody else's product listing. This
 * covers the interface around that content: the header, footer, common
 * buttons and labels, and the cart/checkout flow.
 *
 * Keyed by area so a missing translation is easy to trace back to the
 * screen it belongs to. `t()` falls back to English, then to the key
 * itself, so a string added here without its Bangla yet still renders
 * something rather than breaking the page.
 */
const STRINGS = {
  // ------------------------------------------------------------- header
  'header.searchPlaceholder': { en: 'Search product', bn: 'পণ্য খুঁজুন' },
  'header.searchAriaLabel': { en: 'Search products', bn: 'পণ্য অনুসন্ধান করুন' },
  'header.searchButton': { en: 'Search', bn: 'অনুসন্ধান' },
  'header.searchBy': { en: 'Search by ', bn: 'যা দিয়ে খুঁজুন: ' },
  'header.searchFacetProduct': { en: 'product', bn: 'পণ্য' },
  'header.searchFacetBrand': { en: 'brand', bn: 'ব্র্যান্ড' },
  'header.searchFacetCategory': { en: 'category', bn: 'ক্যাটাগরি' },
  'header.cart': { en: 'Cart', bn: 'কার্ট' },
  'header.wishlist': { en: 'Wishlist', bn: 'পছন্দ' },
  'header.login': { en: 'Login', bn: 'লগইন' },
  'header.myAccount': { en: 'My Account', bn: 'আমার একাউন্ট' },
  'header.createAccount': { en: 'Create account', bn: 'একাউন্ট খুলুন' },
  'header.shop': { en: 'Shop', bn: 'কেনাকাটা' },
  'header.offers': { en: 'Offers', bn: 'অফার' },
  'header.contact': { en: 'Contact', bn: 'যোগাযোগ' },
  'header.earnRewards': { en: 'Earn rewards', bn: 'রিওয়ার্ড অর্জন করুন' },
  'header.orderTrack': { en: 'Order Track', bn: 'অর্ডার ট্র্যাক' },
  'header.openMenu': { en: 'Open menu', bn: 'মেনু খুলুন' },
  'header.closeMenu': { en: 'Close menu', bn: 'মেনু বন্ধ করুন' },
  'header.language': { en: 'Language', bn: 'ভাষা' },
  'header.switchToEnglish': { en: 'Switch to English', bn: 'ইংরেজিতে দেখুন' },
  'header.switchToBangla': { en: 'Switch to Bangla', bn: 'বাংলায় দেখুন' },
  'header.seeAllResult': { en: 'See all {count} result', bn: '{count} টি ফলাফল দেখুন' },
  'header.seeAllResults': { en: 'See all {count} results', bn: '{count} টি ফলাফল দেখুন' },
  'header.searching': { en: 'Searching…', bn: 'খোঁজা হচ্ছে…' },
  'header.noMatch': { en: 'Nothing matches “{query}”.', bn: '“{query}”-এর সাথে কিছু মেলেনি।' },
  'header.outOfStock': { en: 'Out of stock', bn: 'স্টকে নেই' },
  'header.signedInAs': { en: 'Signed in as {name}', bn: '{name} হিসেবে সাইন ইন করা আছে' },
  'header.yourAccount': { en: 'Your account', bn: 'আপনার একাউন্ট' },
  'header.allCategories': { en: 'All Categories', bn: 'সব ক্যাটাগরি' },

  // -------------------------------------------------------------- about
  'about.chip': { en: 'Established 2026', bn: 'প্রতিষ্ঠা ২০২৬' },
  'about.heading': { en: 'About us', bn: 'আমাদের সম্পর্কে' },
  'about.noticeTitle': { en: 'A note on ownership', bn: 'মালিকানা সম্পর্কে জরুরি বিজ্ঞপ্তি' },
  'about.story': { en: 'Our story', bn: 'আমাদের কথা' },
  'about.how': { en: 'How we work', bn: 'আমরা যেভাবে কাজ করি' },
  'about.cta': { en: 'Start shopping', bn: 'কেনাকাটা শুরু করুন' },
  'about.ctaAside': { en: 'Something to ask first?', bn: 'আগে কিছু জানার আছে?' },
  'about.ctaLink': { en: 'Talk to us', bn: 'আমাদের সাথে কথা বলুন' },
  'about.missing': {
    en: 'This has not been written yet. The owner adds it under Admin > Settings > Pages.',
    bn: 'এটি এখনো লেখা হয়নি। Admin > Settings > Pages থেকে যোগ করা যাবে।',
  },
  'about.stockTitle': { en: 'Real stock counts', bn: 'সত্যিকারের স্টক' },
  'about.stockBody': {
    en: 'What the page says is in stock is what the shelf holds. We do not take orders for what we do not have.',
    bn: 'পেজে যা স্টকে দেখাচ্ছে, তাকেই বোঝায় আমাদের কাছে আছে। যা নেই, তার অর্ডার আমরা নিই না।',
  },
  'about.payTitle': { en: 'Pay when it arrives', bn: 'পণ্য হাতে পেয়ে দাম' },
  'about.payBody': {
    en: 'Cash on delivery, or bKash and Nagad if you would rather pay up front. The price you saw is the price you pay.',
    bn: 'ক্যাশ অন ডেলিভারি, অথবা চাইলে আগেই বিকাশ ও নগদে। যে দাম দেখেছেন, সেটাই দেবেন।',
  },
  'about.pointsTitle': { en: 'Points on every order', bn: 'প্রতি অর্ডারে পয়েন্ট' },
  'about.pointsBody': {
    en: 'Delivered orders earn reward points that come straight off a later bill.',
    bn: 'ডেলিভারি হওয়া অর্ডারে রিওয়ার্ড পয়েন্ট জমা হয়, যা পরের বিল থেকে সরাসরি কমে যায়।',
  },
  'about.trackTitle': { en: 'Track it yourself', bn: 'নিজেই ট্র্যাক করুন' },
  'about.trackBody': {
    en: 'Every order has a number you can follow from confirmation to your door, without calling anyone.',
    bn: 'প্রতিটি অর্ডারের একটি নম্বর থাকে — কনফার্ম থেকে দরজা পর্যন্ত কাউকে ফোন না করেই দেখে নিতে পারবেন।',
  },

  // ------------------------------------------------------------- footer
  'footer.description': {
    en: 'Discover quality products at great prices with a simple, secure and convenient online shopping experience.',
    bn: 'সহজ, নিরাপদ এবং সুবিধাজনক অনলাইন কেনাকাটার অভিজ্ঞতায় সাশ্রয়ী মূল্যে মানসম্মত পণ্য খুঁজে নিন।',
  },
  'footer.followUs': { en: 'Follow us', bn: 'আমাদের ফলো করুন' },
  'footer.quickLinks': { en: 'Quick Links', bn: 'দ্রুত লিংক' },
  'footer.allProducts': { en: 'All Products', bn: 'সব পণ্য' },
  'footer.browseProducts': { en: 'Browse Products', bn: 'পণ্য ব্রাউজ করুন' },
  'footer.newArrivals': { en: 'New Arrivals', bn: 'নতুন এসেছে' },
  'footer.contactUs': { en: 'Contact Us', bn: 'যোগাযোগ করুন' },
  'footer.customerService': { en: 'Customer Service', bn: 'গ্রাহক সেবা' },
  'footer.aboutUs': { en: 'About Us', bn: 'আমাদের সম্পর্কে' },
  'footer.privacyPolicy': { en: 'Privacy Policy', bn: 'গোপনীয়তা নীতি' },
  'footer.termsConditions': { en: 'Terms & Conditions', bn: 'শর্তাবলী' },
  'footer.contactInformation': { en: 'Contact Information', bn: 'যোগাযোগের তথ্য' },
  'footer.weAccept': { en: 'We Accept', bn: 'পেমেন্ট মাধ্যম' },
  'footer.cashOnDelivery': { en: 'Cash on Delivery', bn: 'ক্যাশ অন ডেলিভারি' },
  'footer.bankTransfer': { en: 'Bank Transfer', bn: 'ব্যাংক ট্রান্সফার' },
  'footer.allRightsReserved': { en: 'All Rights Reserved', bn: 'সর্বস্বত্ব সংরক্ষিত' },

  // ----------------------------------------------------------- homepage
  'home.promotions': { en: 'Promotions', bn: 'প্রোমোশন' },
  'home.showSlide': { en: 'Show slide {n}', bn: '{n} নম্বর স্লাইড দেখান' },
  'home.shopNow': { en: 'Shop now', bn: 'কেনাকাটা করুন' },
  'home.noCategoriesYet': { en: 'No categories yet.', bn: 'এখনো কোনো ক্যাটাগরি নেই।' },
  'home.itemsCount': { en: '{count} items', bn: '{count} টি পণ্য' },
  'home.seeMore': { en: 'See More', bn: 'আরও দেখুন' },
  'home.shopByCategory': { en: 'Shop by category', bn: 'ক্যাটাগরি অনুযায়ী কেনাকাটা' },
  'home.trendingRightNow': { en: 'Trending right now', bn: 'এখন যা জনপ্রিয়' },
  'home.latestProducts': { en: 'Latest products', bn: 'সাম্প্রতিক পণ্য' },
  'home.noProductsYet': { en: 'No products yet', bn: 'এখনো কোনো পণ্য নেই' },
  'home.noProductsYetBody': {
    en: 'Once products are published they will appear here, grouped by category.',
    bn: 'পণ্য প্রকাশিত হলে এখানে ক্যাটাগরি অনুযায়ী দেখা যাবে।',
  },

  // -------------------------------------------- add to cart / buy box
  'cart.addToCart': { en: 'Add to cart', bn: 'কার্টে যোগ করুন' },
  'cart.added': { en: 'Added', bn: 'যোগ হয়েছে' },
  'cart.addedToCart': { en: 'Added to cart', bn: 'কার্টে যোগ হয়েছে' },
  'cart.outOfStock': { en: 'Out of stock', bn: 'স্টকে নেই' },
  'cart.inStock': { en: 'In stock', bn: 'স্টকে আছে' },
  'cart.onlyLeft': { en: '— only {count} left', bn: '— মাত্র {count} টি বাকি' },
  'cart.reduceQuantity': { en: 'Reduce quantity', bn: 'পরিমাণ কমান' },
  'cart.increaseQuantity': { en: 'Increase quantity', bn: 'পরিমাণ বাড়ান' },
  'cart.viewCart': { en: 'View cart', bn: 'কার্ট দেখুন' },
  'cart.addFailed': { en: 'Could not add that to your cart.', bn: 'কার্টে যোগ করা যায়নি।' },
  'cart.chooseOptions': { en: 'Choose options', bn: 'অপশন বেছে নিন' },
  'cart.sold': { en: 'Sold', bn: 'বিক্রি হয়েছে' },
  'cart.saveToWishlist': { en: 'Save to your wishlist', bn: 'পছন্দের তালিকায় রাখুন' },
  'cart.removeFromWishlist': { en: 'Remove {name} from your wishlist', bn: 'পছন্দের তালিকা থেকে {name} সরান' },
  'cart.saveNamedToWishlist': { en: 'Save {name} to your wishlist', bn: '{name} পছন্দের তালিকায় রাখুন' },
  'cart.rewardPoints': { en: '+{points} pts', bn: '+{points} পয়েন্ট' },
  'wishlist.saved': { en: 'Saved to your wishlist', bn: 'পছন্দের তালিকায় রাখা হয়েছে' },

  // ---------------------------------------------------------- cart page
  'cart.title': { en: 'Your cart', bn: 'আপনার কার্ট' },
  'cart.empty': { en: 'Your cart is empty', bn: 'আপনার কার্ট খালি' },
  'cart.emptyBody': {
    en: 'Nothing here yet. Browse the shop and add something you like.',
    bn: 'এখনো কিছু নেই। দোকান ঘুরে দেখুন এবং পছন্দের কিছু যোগ করুন।',
  },
  'cart.startShopping': { en: 'Start shopping', bn: 'কেনাকাটা শুরু করুন' },
  'cart.unheldWarning': {
    en: 'Some items are no longer reserved for you. Carts hold stock for a limited time so it does not sit unavailable for everyone else. Adjust the quantity to take them again.',
    bn: 'কিছু পণ্য আর আপনার জন্য সংরক্ষিত নেই। স্টক অন্যদের জন্য আটকে না রাখতে কার্ট সীমিত সময়ের জন্য পণ্য ধরে রাখে। আবার নিতে হলে পরিমাণ পরিবর্তন করুন।',
  },
  'cart.removeItem': { en: 'Remove {name}', bn: '{name} সরান' },
  'cart.skuLabel': { en: 'SKU: {sku}', bn: 'এসকেইউ: {sku}' },
  'cart.noLongerReserved': { en: 'No longer reserved for you', bn: 'আর আপনার জন্য সংরক্ষিত নেই' },
  'cart.leftInStock': { en: '— {count} left in stock', bn: '— স্টকে বাকি {count} টি' },
  'cart.outOfStockSuffix': { en: '— out of stock', bn: '— স্টকে নেই' },
  'cart.productHeader': { en: 'Product', bn: 'পণ্য' },
  'cart.priceHeader': { en: 'Price', bn: 'মূল্য' },
  'cart.quantityHeader': { en: 'Quantity', bn: 'পরিমাণ' },
  'cart.subtotalHeader': { en: 'Subtotal', bn: 'সাবটোটাল' },
  'cart.clearCart': { en: 'Clear shopping cart', bn: 'কার্ট খালি করুন' },
  'cart.clearConfirm': { en: 'Remove everything from your cart?', bn: 'কার্ট থেকে সবকিছু সরাতে চান?' },
  'cart.orderSummary': { en: 'Order summary', bn: 'অর্ডার সারাংশ' },
  'cart.items': { en: 'Items', bn: 'পণ্য সংখ্যা' },
  'cart.youSave': { en: 'You save', bn: 'আপনি সাশ্রয় করছেন' },
  'cart.couponLabel': { en: 'Coupon ({code})', bn: 'কুপন ({code})' },
  'cart.pointsLabel': { en: 'Points ({points})', bn: 'পয়েন্ট ({points})' },
  'cart.total': { en: 'Total', bn: 'সর্বমোট' },
  'cart.proceedToCheckout': { en: 'Proceed to checkout', bn: 'চেকআউটে যান' },
  'cart.codAvailable': {
    en: 'Cash on delivery available. Delivery charge is calculated at checkout.',
    bn: 'ক্যাশ অন ডেলিভারি সুবিধা আছে। ডেলিভারি চার্জ চেকআউটে হিসাব করা হবে।',
  },
  'cart.genericFailure': { en: 'That did not work.', bn: 'এটি কাজ করেনি।' },
  'cart.selectAll': { en: 'Select All ({count} Items)', bn: 'সব নির্বাচন করুন ({count} টি পণ্য)' },
  'cart.selectItem': { en: 'Select {name}', bn: '{name} নির্বাচন করুন' },
  'cart.removeSelected': { en: 'Remove selected', bn: 'নির্বাচিত পণ্য সরান' },
  'cart.removeSelectedConfirm': {
    en: 'Remove the {count} selected item(s) from your cart?',
    bn: 'নির্বাচিত {count} টি পণ্য কার্ট থেকে সরাতে চান?',
  },
  'cart.selectAtLeastOne': {
    en: 'Select at least one item to check out.',
    bn: 'চেকআউট করতে অন্তত একটি পণ্য নির্বাচন করুন।',
  },

  // -------------------------------------------------------- coupon box
  'coupon.title': { en: 'Coupon code', bn: 'কুপন কোড' },
  'coupon.applied': { en: '“{code}” applied — you save {amount}', bn: '“{code}” প্রয়োগ হয়েছে — আপনি সাশ্রয় করছেন {amount}' },
  'coupon.invalid': { en: '“{code}”: {message}', bn: '“{code}”: {message}' },
  'coupon.noLongerApplies': { en: 'no longer applies', bn: 'আর প্রযোজ্য নয়' },
  'coupon.remove': { en: 'Remove', bn: 'সরান' },
  'coupon.enterCode': { en: 'Enter code', bn: 'কোড লিখুন' },
  'coupon.apply': { en: 'Apply coupon', bn: 'কুপন প্রয়োগ করুন' },
  'coupon.applyFailed': { en: 'That coupon could not be applied.', bn: 'কুপনটি প্রয়োগ করা যায়নি।' },

  // ------------------------------------------------- reward points box
  'reward.title': { en: 'Reward points', bn: 'রিওয়ার্ড পয়েন্ট' },
  'reward.phonePlaceholder': { en: 'Your phone number', bn: 'আপনার ফোন নম্বর' },
  'reward.phoneAriaLabel': { en: 'Phone number', bn: 'ফোন নম্বর' },
  'reward.checkBalance': { en: 'Check balance', bn: 'ব্যালেন্স দেখুন' },
  'reward.checkFailed': { en: 'Could not check that number.', bn: 'এই নম্বরটি যাচাই করা যায়নি।' },
  'reward.pointsOnNumberSuffix': { en: 'points on this number.', bn: 'পয়েন্ট এই নম্বরে আছে।' },
  'reward.logIn': { en: 'Log in', bn: 'লগইন করুন' },
  'reward.toRedeemThem': { en: 'to redeem them.', bn: 'পয়েন্ট ব্যবহার করতে।' },
  'reward.noneFound': { en: 'No reward points found for this number.', bn: 'এই নম্বরে কোনো রিওয়ার্ড পয়েন্ট পাওয়া যায়নি।' },
  'reward.appliedPoints': { en: '{points} points applied — you save {amount}', bn: '{points} পয়েন্ট প্রয়োগ হয়েছে — আপনি সাশ্রয় করছেন {amount}' },
  'reward.invalidPoints': { en: '{points} points: {message}', bn: '{points} পয়েন্ট: {message}' },
  'reward.redeemFailed': { en: 'Those points could not be redeemed.', bn: 'ঐ পয়েন্টগুলো ব্যবহার করা যায়নি।' },
  'reward.youHave': { en: 'You have', bn: 'আপনার আছে' },
  'reward.pointsAvailableSuffix': { en: 'points available.', bn: 'পয়েন্ট ব্যবহারযোগ্য।' },
  'reward.pointsToRedeemPlaceholder': { en: 'Points to redeem', bn: 'ব্যবহারের পয়েন্ট' },
  'reward.pointsToRedeemAriaLabel': { en: 'Reward points to redeem', bn: 'ব্যবহারের রিওয়ার্ড পয়েন্ট' },
  'reward.redeem': { en: 'Redeem', bn: 'ব্যবহার করুন' },
  'reward.none': { en: "You don't have any reward points yet.", bn: 'আপনার এখনো কোনো রিওয়ার্ড পয়েন্ট নেই।' },

  // ----------------------------------------------------- checkout steps
  'steps.cart': { en: 'Cart', bn: 'কার্ট' },
  'steps.checkout': { en: 'Checkout', bn: 'চেকআউট' },
  'steps.orderComplete': { en: 'Order complete', bn: 'অর্ডার সম্পন্ন' },

  // ------------------------------------------------------- checkout page
  'checkout.numberCopied': { en: 'Number copied.', bn: 'নম্বর কপি হয়েছে।' },
  'checkout.copyFailed': { en: 'Could not copy the number.', bn: 'নম্বরটি কপি করা যায়নি।' },
  'checkout.title': { en: 'Checkout', bn: 'চেকআউট' },
  'checkout.empty': { en: 'Nothing to check out', bn: 'চেকআউট করার মতো কিছু নেই' },
  'checkout.emptyBody': { en: 'Your cart is empty.', bn: 'আপনার কার্ট খালি।' },
  'checkout.unheldWarning1': { en: 'Some items are no longer reserved for you.', bn: 'কিছু পণ্য আর আপনার জন্য সংরক্ষিত নেই।' },
  'checkout.openYourCart': { en: 'Open your cart', bn: 'আপনার কার্ট খুলুন' },
  'checkout.unheldWarning2': { en: 'and adjust them before ordering.', bn: 'এবং অর্ডার করার আগে পরিবর্তন করুন।' },

  'checkout.deliveryAddress': { en: 'Delivery address', bn: 'ডেলিভারি ঠিকানা' },
  'checkout.deliverElsewhere': { en: 'Deliver somewhere else', bn: 'অন্য কোথাও ডেলিভারি' },
  'checkout.enterNewAddress': { en: 'Enter a new address', bn: 'নতুন ঠিকানা লিখুন' },
  'checkout.fullName': { en: 'Full name', bn: 'পুরো নাম' },
  'checkout.nameRequired': { en: 'Your name is required.', bn: 'আপনার নাম আবশ্যক।' },
  'checkout.mobileNumber': { en: 'Mobile number', bn: 'মোবাইল নম্বর' },
  'checkout.mobileRequired': { en: 'A mobile number is required.', bn: 'একটি মোবাইল নম্বর আবশ্যক।' },
  'checkout.mobileInvalid': { en: 'Enter a valid Bangladeshi mobile number.', bn: 'একটি সঠিক বাংলাদেশি মোবাইল নম্বর লিখুন।' },
  'checkout.address': { en: 'Address', bn: 'ঠিকানা' },
  'checkout.addressPlaceholder': { en: 'House, road, block', bn: 'বাড়ি, রোড, ব্লক' },
  'checkout.addressRequired': { en: 'An address is required.', bn: 'একটি ঠিকানা আবশ্যক।' },
  'checkout.area': { en: 'Area (optional)', bn: 'এলাকা (ঐচ্ছিক)' },
  'checkout.areaPlaceholder': { en: 'Mirpur, Uttara…', bn: 'মিরপুর, উত্তরা…' },
  'checkout.city': { en: 'City', bn: 'শহর' },
  'checkout.cityRequired': { en: 'A city is required.', bn: 'একটি শহর আবশ্যক।' },
  'checkout.district': { en: 'District', bn: 'জেলা' },
  'checkout.districtRequired': { en: 'Choose your district.', bn: 'আপনার জেলা বেছে নিন।' },

  'checkout.deliveryOption': { en: 'Delivery option', bn: 'ডেলিভারি অপশন' },
  'checkout.enterDistrictFirst': {
    en: 'Enter a district above to see delivery options.',
    bn: 'ডেলিভারি অপশন দেখতে উপরে জেলা লিখুন।',
  },
  'checkout.checkingDelivery': { en: 'Checking delivery to {district}…', bn: '{district}-এ ডেলিভারি যাচাই হচ্ছে…' },
  'checkout.noDeliveryOption': {
    en: 'No delivery option covers that address with this payment method.',
    bn: 'এই ঠিকানা ও পেমেন্ট পদ্ধতির জন্য কোনো ডেলিভারি অপশন নেই।',
  },
  'checkout.free': { en: 'Free', bn: 'ফ্রি' },

  'checkout.payment': { en: 'Payment', bn: 'পেমেন্ট' },
  'checkout.sendPaymentTo': { en: 'Send payment to', bn: 'যেখানে পেমেন্ট পাঠাবেন' },
  'checkout.copyReceiveNumber': { en: 'Copy the receive number', bn: 'নম্বরটি কপি করুন' },
  'checkout.noteForUs': { en: 'Note for us (optional)', bn: 'আমাদের জন্য নোট (ঐচ্ছিক)' },
  'checkout.deliveryInstructions': { en: 'Any delivery instructions', bn: 'ডেলিভারি সংক্রান্ত নির্দেশনা' },

  'checkout.orderSummary': { en: 'Order summary', bn: 'অর্ডার সারাংশ' },
  'checkout.subtotal': { en: 'Subtotal', bn: 'সাবটোটাল' },
  'checkout.couponLabel': { en: 'Coupon ({code})', bn: 'কুপন ({code})' },
  'checkout.pointsLabel': { en: 'Points ({points})', bn: 'পয়েন্ট ({points})' },
  'checkout.noLongerApplies': { en: 'no longer applies', bn: 'আর প্রযোজ্য নয়' },
  'checkout.delivery': { en: 'Delivery', bn: 'ডেলিভারি' },
  'checkout.paymentCharge': { en: 'Payment charge', bn: 'পেমেন্ট চার্জ' },
  'checkout.total': { en: 'Total', bn: 'সর্বমোট' },
  'checkout.placeOrder': { en: 'Place order', bn: 'অর্ডার করুন' },
  'checkout.payToCourier': {
    en: 'Pay {amount} to the courier when your order arrives.',
    bn: 'অর্ডার পৌঁছালে ডেলিভারিম্যানকে {amount} পরিশোধ করুন।',
  },

  'checkout.chooseDeliveryFirst': { en: 'Choose a delivery option first.', bn: 'প্রথমে একটি ডেলিভারি অপশন বেছে নিন।' },
  'checkout.couponExpired': {
    en: 'That coupon no longer applies. Remove it in your cart and try again.',
    bn: 'এই কুপন আর প্রযোজ্য নয়। কার্ট থেকে সরিয়ে আবার চেষ্টা করুন।',
  },
  'checkout.pointsExpired': {
    en: 'That points redemption no longer applies. Remove it in your cart and try again.',
    bn: 'এই পয়েন্ট ব্যবহার আর প্রযোজ্য নয়। কার্ট থেকে সরিয়ে আবার চেষ্টা করুন।',
  },
  'checkout.placeOrderFailed': { en: 'Could not place the order.', bn: 'অর্ডারটি করা যায়নি।' },

  // ------------------------------------------------- order complete page
  'order.phoneMismatch': { en: 'That number does not match this order.', bn: 'এই নম্বরটি এই অর্ডারের সাথে মেলেনি।' },
  'order.thankYou': { en: 'Thank you — your order is placed.', bn: 'ধন্যবাদ — আপনার অর্ডারটি সম্পন্ন হয়েছে।' },
  'order.willCall': {
    en: 'We will call you on {phone} to confirm before sending it out.',
    bn: 'পাঠানোর আগে নিশ্চিত করতে আমরা {phone} নম্বরে কল করব।',
  },
  'order.payCourier': { en: 'Pay the courier when it arrives.', bn: 'পৌঁছালে ডেলিভারিম্যানকে পরিশোধ করুন।' },
  'order.orderId': { en: 'Order ID', bn: 'অর্ডার আইডি' },
  'order.paymentMethod': { en: 'Payment method', bn: 'পেমেন্ট পদ্ধতি' },
  'order.status': { en: 'Status', bn: 'অবস্থা' },
  'order.product': { en: 'Product', bn: 'পণ্য' },
  'order.quantity': { en: 'Quantity', bn: 'পরিমাণ' },
  'order.subtotal': { en: 'Subtotal', bn: 'সাবটোটাল' },
  'order.discount': { en: 'Discount', bn: 'ছাড়' },
  'order.coupon': { en: 'Coupon', bn: 'কুপন' },
  'order.delivery': { en: 'Delivery', bn: 'ডেলিভারি' },
  'order.total': { en: 'Total', bn: 'সর্বমোট' },
  'order.stillToPay': { en: 'Still to pay', bn: 'এখনো বাকি' },
  'order.deliveringTo': { en: 'Delivering to', bn: 'যেখানে পাঠানো হবে' },
  'order.estimatedDelivery': { en: 'Estimated delivery: {estimate}', bn: 'আনুমানিক ডেলিভারি: {estimate}' },
  'order.placed': { en: 'Placed', bn: 'অর্ডারের সময়' },
  'order.trackThisOrder': { en: 'Track this order', bn: 'এই অর্ডার ট্র্যাক করুন' },
  'order.continueShopping': { en: 'Continue shopping', bn: 'কেনাকাটা চালিয়ে যান' },

  // -------------------------------------------------------- phone gate
  'phoneGate.title': { en: 'Find order {number}', bn: '{number} অর্ডারটি খুঁজুন' },
  'phoneGate.bodyPrefix': {
    en: 'Enter the mobile number the order was placed with, or',
    bn: 'যে মোবাইল নম্বর দিয়ে অর্ডার করা হয়েছিল সেটি লিখুন, অথবা',
  },
  'phoneGate.signIn': { en: 'sign in', bn: 'সাইন ইন করুন' },
  'phoneGate.mobileAriaLabel': { en: 'Mobile number', bn: 'মোবাইল নম্বর' },
  'phoneGate.showOrder': { en: 'Show my order', bn: 'আমার অর্ডার দেখান' },
}

/**
 * `{placeholder}` substitution, so a string like "See all {count} results"
 * stays one translatable sentence instead of being spliced together from
 * fragments that would not reorder correctly in Bangla.
 */
function fill(template, vars) {
  if (!vars) return template

  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  )
}

export function useTranslation() {
  const locale = useLocaleStore((state) => state.locale)

  const t = (key, vars) => {
    const entry = STRINGS[key]

    if (!entry) return key

    return fill(entry[locale] ?? entry.en ?? key, vars)
  }

  return { t, locale }
}
