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
