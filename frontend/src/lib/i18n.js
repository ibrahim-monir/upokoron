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
