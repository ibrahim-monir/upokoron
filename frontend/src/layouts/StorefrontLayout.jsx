import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  ImageOff,
  Loader2,
  Gift,
  Heart,
  LogIn,
  Megaphone,
  Menu,
  MessageCircle,
  Package,
  Phone,
  Search,
  ShoppingBag,
  ShoppingCart,
  User,
  X,
} from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { get } from '../lib/api'
import { cx, money } from '../lib/format'
import { useAnalytics } from '../lib/useAnalytics'
import { useCustomScripts } from '../lib/useCustomScripts'
import { useFavicon } from '../lib/useFavicon'
import { useTranslation } from '../lib/i18n'
import { useAuthStore } from '../stores/authStore'
import { Logo } from '../components/Logo'
import { LanguageToggle } from '../components/LanguageToggle'
import { useCartCount } from '../features/cart/useCart'
import { CartDrawer } from '../features/cart/CartDrawer'
import { useCartDrawer } from '../features/cart/useCartDrawer'
import { useRewardInfo } from '../features/storefront/useRewardInfo'
import { useWishlistCount } from '../stores/wishlistStore'
import { Footer } from './Footer'

function useStoreSettings() {
  return useQuery({
    queryKey: ['shop', 'settings'],
    queryFn: () => get('/shop/settings'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })
}

function useStoreCategories() {
  return useQuery({
    queryKey: ['shop', 'categories'],
    queryFn: () => get('/shop/categories'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })
}

/**
 * Hold a value still for a moment.
 *
 * Typing "power bank" is ten keystrokes; without this it is also ten
 * requests, nine of which are answers to a question nobody finished asking.
 */
function useDebounced(value, delay = 220) {
  const [settled, setSettled] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay)

    return () => clearTimeout(timer)
  }, [value, delay])

  return settled
}

/**
 * A handful of real products, to build the search box's example phrases
 * from. Cached for a while -- these are just for show, so there is no
 * reason to refetch them as often as an actual product listing would need.
 */
function useSearchExamples() {
  return useQuery({
    queryKey: ['shop', 'products', 'search-examples'],
    queryFn: () => get('/shop/products', { params: { per_page: 40 } }),
    staleTime: 10 * 60 * 1000,
    select: (response) => response.data ?? [],
  })
}

/**
 * Long enough to fit the search box while it is being typed out, short
 * enough that a name like "Veroboard Normal Line 14.5×6.5cm Stripboard PCB
 * Printed Circuit Board For Prototyping..." (a real product name in this
 * catalogue) does not turn one phrase into a fifteen-second scroll of text.
 * Names over this are skipped for the example list rather than truncated
 * mid-word, so what's shown always reads as a complete phrase.
 */
const MAX_EXAMPLE_LENGTH = 28

function fitsAsExample(text) {
  return typeof text === 'string' && text.length > 0 && text.length <= MAX_EXAMPLE_LENGTH
}

/**
 * "product (...)", "brand (...)" and "category (...)" phrases, each with a
 * couple of real examples -- so a shopper who has never searched here
 * before sees, in the box itself, the three things this search actually
 * matches. Skips a facet entirely if nothing in the sample has one short
 * enough to show (an unbranded product, a product with no category).
 *
 * The facet word itself (product/brand/category) is translated; the
 * examples in parentheses are not -- they are real catalogue names, in
 * whichever language the owner entered them.
 */
function buildSearchPhrases(products, labels) {
  const names = []
  const brands = []
  const categories = []

  for (const product of products) {
    if (fitsAsExample(product.name) && names.length < 2 && !names.includes(product.name)) {
      names.push(product.name)
    }
    if (
      fitsAsExample(product.brand?.name) &&
      brands.length < 2 &&
      !brands.includes(product.brand.name)
    ) {
      brands.push(product.brand.name)
    }
    if (
      fitsAsExample(product.category?.name) &&
      categories.length < 2 &&
      !categories.includes(product.category.name)
    ) {
      categories.push(product.category.name)
    }
  }

  return [
    names.length > 0 && `${labels.product} (${names.join(', ')})`,
    brands.length > 0 && `${labels.brand} (${brands.join(', ')})`,
    categories.length > 0 && `${labels.category} (${categories.join(', ')})`,
  ].filter(Boolean)
}

/**
 * Grapheme clusters, not UTF-16 code units. A Bangla conjunct like the "ণ্য"
 * in পণ্য is several code units for one visual character; slicing a plain
 * string by index can stop mid-conjunct and flash a broken glyph for one
 * frame. Intl.Segmenter (supported in every browser this app targets) walks
 * whole characters instead.
 */
const graphemeSegmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

function toGraphemes(text) {
  if (!graphemeSegmenter) return Array.from(text)

  return Array.from(graphemeSegmenter.segment(text), (entry) => entry.segment)
}

/**
 * A placeholder that types itself out after a fixed prefix, pauses, erases
 * back down to that prefix, and moves on to the next phrase -- the same
 * rhythm a shopper would see typing a real query, so the box demonstrates
 * what it can search rather than just naming it.
 */
function useTypedPlaceholder(prefix, phrases) {
  const [suffix, setSuffix] = useState('')

  useEffect(() => {
    if (phrases.length === 0) {
      setSuffix('')
      return undefined
    }

    const TYPE_MS = 90
    const ERASE_MS = 55
    const HOLD_MS = 1200
    const GAP_MS = 400

    let phraseIndex = 0
    let charIndex = 0
    let phase = 'typing'
    let timer

    const tick = () => {
      const graphemes = toGraphemes(phrases[phraseIndex % phrases.length])

      if (phase === 'typing') {
        charIndex += 1
        setSuffix(graphemes.slice(0, charIndex).join(''))
        phase = charIndex >= graphemes.length ? 'holding' : 'typing'
        timer = setTimeout(tick, phase === 'holding' ? HOLD_MS : TYPE_MS)

        return
      }

      if (phase === 'holding') {
        phase = 'erasing'
        timer = setTimeout(tick, ERASE_MS)

        return
      }

      if (phase === 'erasing') {
        charIndex -= 1
        setSuffix(graphemes.slice(0, charIndex).join(''))

        if (charIndex <= 0) {
          phraseIndex += 1
          phase = 'waiting'
          timer = setTimeout(tick, GAP_MS)
        } else {
          timer = setTimeout(tick, ERASE_MS)
        }

        return
      }

      // waiting
      phase = 'typing'
      timer = setTimeout(tick, TYPE_MS)
    }

    timer = setTimeout(tick, TYPE_MS)

    return () => clearTimeout(timer)
    // phrases is rebuilt with useMemo, so this only restarts when the
    // example set actually changes, not on every render.
  }, [prefix, phrases])

  return prefix + suffix
}

/** Two characters. One matches most of the catalogue and suggests nothing. */
const MIN_QUERY = 2

/** The matched run, marked in place, so it is obvious why a row is here. */
function Highlight({ text, query }) {
  const at = text.toLowerCase().indexOf(query.toLowerCase())

  if (at < 0) return text

  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-semibold text-brand-800">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  )
}

function SearchBar({ className }) {
  const { t, locale } = useTranslation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [term, setTerm] = useState(params.get('search') ?? '')
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const boxRef = useRef(null)

  // Both headers render a desktop and a mobile SearchBar, so a fixed id
  // would put duplicates in the document and point aria-controls at
  // whichever one happened to mount first.
  const listId = useId()

  const query = term.trim()
  const debounced = useDebounced(query)
  const enabled = debounced.length >= MIN_QUERY

  const suggestions = useQuery({
    queryKey: ['shop', 'search', debounced],
    queryFn: () => get('/shop/products', { params: { search: debounced, per_page: 6 } }),
    enabled,
    // The previous list stays put while the next one loads, so the panel
    // does not blink empty between keystrokes.
    placeholderData: (previous) => previous,
    staleTime: 60_000,
  })

  const results = enabled ? (suggestions.data?.data ?? []) : []
  const total = suggestions.data?.meta?.total ?? 0

  const examples = useSearchExamples()
  const searchPhrases = useMemo(
    () =>
      buildSearchPhrases(examples.data ?? [], {
        product: t('header.searchFacetProduct'),
        brand: t('header.searchFacetBrand'),
        category: t('header.searchFacetCategory'),
      }),
    // Rebuilding only needs to react to new data or the language actually
    // changing -- `t` is a fresh function every render and would otherwise
    // rebuild (and restart the typing animation) on every keystroke here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [examples.data, locale],
  )
  const typedPlaceholder = useTypedPlaceholder(t('header.searchBy'), searchPhrases)

  // A click anywhere else means the shopper is done with the panel.
  useEffect(() => {
    if (!open) return undefined

    const onPointerDown = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)

    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const go = (path) => {
    setOpen(false)
    setCursor(-1)
    navigate(path)
  }

  const submit = (event) => {
    event.preventDefault()

    // Enter on a highlighted suggestion opens that product; Enter on the
    // text itself runs the full search.
    if (cursor >= 0 && results[cursor]) {
      go(`/products/${results[cursor].slug}`)

      return
    }

    go(query ? `/products?search=${encodeURIComponent(query)}` : '/products')
  }

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
      setCursor(-1)

      return
    }

    if (results.length === 0) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setCursor((current) => {
        const next = event.key === 'ArrowDown' ? current + 1 : current - 1

        // Wraps, so holding Down does not dead-end at the last row.
        if (next >= results.length) return -1
        if (next < -1) return results.length - 1

        return next
      })
    }
  }

  const showPanel = open && query.length >= MIN_QUERY

  return (
    <div ref={boxRef} className={cx('relative', className)}>
      <form role="search" onSubmit={submit} className="relative">
        <input
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value)
            setOpen(true)
            setCursor(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={searchPhrases.length > 0 ? typedPlaceholder : t('header.searchPlaceholder')}
          aria-label={t('header.searchAriaLabel')}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="h-11 w-full rounded-md border-0 bg-white pl-4 pr-14 text-sm text-ink-900 placeholder:text-ink-400"
        />

        <button
          type="submit"
          aria-label={t('header.searchButton')}
          // The one thing in the header that is pressed, so it gets the
          // colour reserved for exactly that.
          className="absolute right-1 top-1 grid h-9 w-11 place-items-center rounded-md bg-brand-600 text-white transition-colors hover:bg-brand-700"
        >
          {suggestions.isFetching ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4.5 w-4.5" aria-hidden="true" />
          )}
        </button>
      </form>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-raised"
        >
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-500">
              {suggestions.isFetching ? t('header.searching') : t('header.noMatch', { query })}
            </p>
          ) : (
            <>
              <ul className="max-h-[22rem] overflow-y-auto py-1">
                {results.map((product, index) => {
                  const variation = product.default_variation

                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={cursor === index}
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => go(`/products/${product.slug}`)}
                        className={cx(
                          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                          cursor === index ? 'bg-brand-50' : 'hover:bg-ink-50',
                        )}
                      >
                        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-ink-100">
                          {product.primary_image ? (
                            <img
                              src={product.primary_image}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <ImageOff className="h-4 w-4 text-ink-300" aria-hidden="true" />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-ink-900">
                            <Highlight text={product.name} query={query} />
                          </span>

                          {product.category?.name && (
                            <span className="mt-0.5 block truncate text-xs text-ink-500">
                              {product.category.name}
                            </span>
                          )}
                        </span>

                        <span className="shrink-0 text-right">
                          <span className="block text-sm font-semibold text-ink-900">
                            {money(variation?.effective_price ?? variation?.selling_price ?? 0)}
                          </span>

                          {variation && !variation.in_stock && (
                            <span className="text-[11px] text-danger-700">{t('header.outOfStock')}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              <button
                type="button"
                onClick={() => go(`/products?search=${encodeURIComponent(query)}`)}
                className="flex w-full items-center justify-center gap-1.5 border-t border-ink-100 bg-ink-50 px-4 py-2.5 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-50"
              >
                {t(total === 1 ? 'header.seeAllResult' : 'header.seeAllResults', { count: total })}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Counter badges sit on the cart and wishlist icons.
 *
 * The cart count is read from the server's copy of the basket. The wishlist
 * count comes from local storage instead: saved items are per-device until
 * there is a wishlist table to hang them on.
 */
function IconCounter({ icon: Icon, count = 0, label, to, onClick }) {
  const Wrapper = onClick ? 'button' : Link

  return (
    // White on the navy bar, with the count in a white pill. The count uses
    // brand-800 rather than brand-600: at 10px on white the brighter orange
    // does not carry enough contrast to be read.
    <Wrapper
      {...(onClick ? { type: 'button', onClick } : { to })}
      className="relative flex items-center gap-1.5 text-white/95 hover:text-white"
    >
      <span className="relative">
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-brand-800">
          {count}
        </span>
      </span>
      {label && <span className="hidden whitespace-nowrap text-sm font-medium lg:inline">{label}</span>}
    </Wrapper>
  )
}

/**
 * The original header: logo, search, and a Shop/Offers/Contact nav in one
 * bar. Kept working, not just around -- store_header_style switches back to
 * this from Admin -> Settings any time, so it cannot be allowed to rot.
 */
function ClassicHeader({ settings, cartCount, user, menuOpen, setMenuOpen }) {
  const { t } = useTranslation()
  const wishlistCount = useWishlistCount()
  const openCart = useCartDrawer((state) => state.show)

  return (
    <header className="sticky top-0 z-30 bg-header text-header-ink shadow-sm">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-3 sm:px-4 lg:gap-5">
        <Logo settings={settings} variant="light" />

        <SearchBar className="hidden max-w-sm flex-1 md:block lg:max-w-md" />

        <nav className="hidden items-center gap-5 lg:flex">
          <NavLink to="/products" className="whitespace-nowrap text-sm font-semibold text-header-muted hover:text-header-ink">
            {t('header.shop')}
          </NavLink>
          <NavLink
            to="/products?sort=oldest"
            className="whitespace-nowrap text-sm font-semibold text-header-muted hover:text-header-ink"
          >
            {t('header.offers')}
          </NavLink>
          <NavLink to="/contact" className="whitespace-nowrap text-sm font-semibold text-header-muted hover:text-header-ink">
            {t('header.contact')}
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:gap-4">
          <LanguageToggle />

          <div className="hidden items-center gap-4 sm:flex">
            <IconCounter icon={ShoppingCart} onClick={openCart} label={t('header.cart')} count={cartCount} />
            <IconCounter icon={Heart} to="/wishlist" label={t('header.wishlist')} count={wishlistCount} />
          </div>

          <span className="hidden h-6 w-px bg-header-line lg:block" />

          {user ? (
            <Link
              to="/account"
              title={user.name ? t('header.signedInAs', { name: user.name }) : t('header.yourAccount')}
              className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-header-muted hover:text-header-ink"
            >
              <User className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('header.myAccount')}</span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-header-muted hover:text-header-ink"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {t('header.login')}
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? t('header.closeMenu') : t('header.openMenu')}
            aria-expanded={menuOpen}
            className="rounded-md p-1.5 text-header-ink hover:bg-header-line lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-header-line px-3 pb-4 pt-3 lg:hidden">
          <div className="md:hidden">
            <SearchBar />
          </div>

          <nav className="mt-3 flex flex-col gap-2.5">
            <NavLink to="/products" className="text-sm font-medium text-header-ink" onClick={() => setMenuOpen(false)}>
              {t('header.shop')}
            </NavLink>
            <NavLink
              to="/products?sort=oldest"
              className="text-sm font-medium text-header-ink"
              onClick={() => setMenuOpen(false)}
            >
              {t('header.offers')}
            </NavLink>
            <NavLink to="/contact" className="text-sm font-medium text-header-ink" onClick={() => setMenuOpen(false)}>
              {t('header.contact')}
            </NavLink>

            {user ? (
              <NavLink to="/account" className="text-sm font-medium text-header-ink" onClick={() => setMenuOpen(false)}>
                {t('header.myAccount')}
              </NavLink>
            ) : (
              <NavLink to="/register" className="text-sm font-medium text-header-ink" onClick={() => setMenuOpen(false)}>
                {t('header.createAccount')}
              </NavLink>
            )}
          </nav>
        </div>
      )}
    </header>
  )
}

/**
 * The scrolling announcement strip, filling whatever room the top bar has
 * left of Order Track / the phone number. Each message shown twice back to
 * back in one continuous track, scrolled exactly one copy's width -- that is
 * what makes the loop point invisible instead of a visible jump or gap.
 * Nothing renders at all with no configured text, and it holds still under
 * prefers-reduced-motion (see index.css's global override for that).
 */
function NewsTicker({ text }) {
  const items = (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (items.length === 0) return null

  return (
    <div className="min-w-0 flex-1 overflow-hidden">
      <div className="ticker-track flex w-max items-center gap-10 whitespace-nowrap">
        {[...items, ...items].map((item, index) => (
          <span key={index} className="flex items-center gap-1.5 text-white/90">
            <Megaphone className="h-3.5 w-3.5 shrink-0 text-white/60" aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Announcement ticker on the left, support phone + Order Track on the right. Hidden on phones -- there is no room, and a tel: link is one tap away in the mobile menu instead. */
/**
 * Whether the shop is advertising its rewards programme.
 *
 * Not the ticker, deliberately: the ticker scrolls, and a link that moves
 * while you aim at it is not a call to action. This sits still, next to
 * Order Track, on every page.
 */
function useRewardsAdvertised() {
  return useRewardInfo().data?.advertised === true
}

function TopBar({ settings }) {
  const { t } = useTranslation()
  const rewardsOn = useRewardsAdvertised()

  return (
    <div className="hidden border-b border-white/10 bg-brand-600 text-white sm:block">
      <div className="mx-auto flex h-9 max-w-[1400px] items-center gap-4 px-3 text-xs sm:px-4">
        <NewsTicker text={settings?.store_ticker_text} />

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <nav className="flex items-center gap-4">
            {rewardsOn && (
              <Link
                to="/rewards"
                className="flex items-center gap-1.5 font-semibold text-white hover:text-white/80"
              >
                <Gift className="h-3.5 w-3.5" aria-hidden="true" />
                {t('header.earnRewards')}
              </Link>
            )}

            <Link to="/track" className="flex items-center gap-1.5 text-white/90 hover:text-white">
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              {t('header.orderTrack')}
            </Link>
          </nav>

          {settings?.store_phone && (
            <a href={`tel:${settings.store_phone}`} className="flex items-center gap-1.5 text-white/90 hover:text-white">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-medium">{settings.store_phone}</span>
              {settings.store_support_hours && (
                <span className="text-white/60">· {settings.store_support_hours}</span>
              )}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Which primary category the visitor is inside.
 *
 * Reads the slug out of the URL and matches it against a root or any root's
 * child, so landing on a sub-category lights up its parent in the top row
 * rather than nothing at all.
 */
function useActiveCategory(list) {
  const { pathname } = useLocation()
  const match = pathname.match(/^\/category\/([^/]+)/)
  const slug = match ? decodeURIComponent(match[1]) : null

  if (slug === null) return { root: null, slug: null }

  const root =
    list.find((category) => category.slug === slug) ??
    list.find((category) => (category.children ?? []).some((child) => child.slug === slug)) ??
    null

  return { root, slug }
}

/**
 * The two-row category menu.
 *
 * Top row: the primary categories. Bottom row: the sub-categories of
 * whichever one the visitor is inside. Both come from the category tree the
 * owner already manages -- there is no second list to keep in step with the
 * catalogue, which is the way these menus usually go wrong.
 *
 * The bottom row follows the page, not the mouse. Swapping it on hover
 * would read better right up until a primary with no children came under
 * the cursor and the whole header changed height; a strip that says "you
 * are here, these are the sections" has to hold still.
 */
function CategoryBar() {
  const categories = useStoreCategories()

  // A menu item that opens an empty page is worse than no menu item.
  //
  // product_count is the whole subtree, not the category's own shelf, so
  // this keeps a primary that stocks nothing directly but has products under
  // its sub-categories, and drops one whose branch is empty all the way
  // down. Publishing a single product anywhere beneath it brings it back.
  const list = (categories.data ?? []).filter((category) => category.product_count > 0)

  const { root, slug } = useActiveCategory(list)
  const subs = root?.children ?? []

  if (categories.isLoading || list.length === 0) return null

  return (
    <nav aria-label="Categories" className="hidden border-b border-ink-200 bg-white lg:block">
      <div className="rail mx-auto max-w-[1400px] px-3 sm:px-4">
        {/*
           w-max + mx-auto, not justify-center: a centred flex row that
           overflows pushes its first items off the left edge and they cannot
           be scrolled back to. Sized to its content, the row centres while it
           fits and scrolls from the left once it does not.
        */}
        <ul className="mx-auto flex w-max items-stretch gap-1">
          {list.map((category) => {
            const isActive = root?.id === category.id

            return (
              <li key={category.id}>
                <Link
                  to={`/category/${category.slug}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={cx(
                    'relative flex items-center whitespace-nowrap px-3 py-3 text-sm font-semibold uppercase transition-colors duration-150',
                    isActive ? 'text-brand-800' : 'text-ink-700 hover:text-brand-800',
                  )}
                >
                  {category.name}

                  {/*
                     The active mark is a rule that grows out of the centre
                     rather than a block of fill behind the text -- on a white
                     bar it should be the one thing that pulls the eye.
                  */}
                  <span
                    aria-hidden="true"
                    className={cx(
                      'pointer-events-none absolute inset-x-3 bottom-0 h-0.5 origin-center rounded-full bg-brand-600 transition-transform duration-200 ease-out',
                      isActive ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>

      {subs.length > 0 && (
        <div className="border-t border-ink-100 bg-ink-50">
          <div className="rail mx-auto max-w-[1400px] px-3 sm:px-4">
            <ul className="mx-auto flex w-max items-center gap-1">
              {/*
                 No "All <category>" entry: the primary in the row above is
                 that link, and it is already lit. Two links to one page, one
                 directly under the other, is one of them saying nothing.
              */}
              {subs.map((child) => {
                const isHere = slug === child.slug

                return (
                  <li key={child.id}>
                    <Link
                      to={`/category/${child.slug}`}
                      aria-current={isHere ? 'page' : undefined}
                      className={cx(
                        'block whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                        isHere
                          ? 'font-semibold text-brand-800'
                          : 'text-ink-600 hover:text-brand-800',
                      )}
                    >
                      {child.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      )}
    </nav>
  )
}

function CategoriesHeader({ settings, cartCount, user, menuOpen, setMenuOpen }) {
  const { t } = useTranslation()
  const wishlistCount = useWishlistCount()
  const openCart = useCartDrawer((state) => state.show)

  const categories = useStoreCategories()
  const categoryList = categories.data ?? []

  return (
    <>
      <TopBar settings={settings} />

      <header className="sticky top-0 z-30 bg-header text-header-ink shadow-sm">
        <div className="mx-auto grid h-16 max-w-[1400px] grid-cols-[auto_1fr_auto] items-center gap-3 px-3 sm:px-4 lg:gap-5">
          <Logo settings={settings} variant="light" />

          {/* The middle grid column, not a flex sibling -- flex-1 grew to
              fill leftover space but stayed pinned to the logo's edge inside
              it, so the search bar looked left-aligned rather than centred
              whenever the logo and the icon cluster were different widths. */}
          <div className="hidden justify-center md:flex">
            <SearchBar className="w-full max-w-md" />
          </div>

          <div className="flex items-center gap-3 lg:gap-4">
            <LanguageToggle />

            <div className="hidden items-center gap-4 sm:flex">
              <IconCounter icon={ShoppingCart} onClick={openCart} label={t('header.cart')} count={cartCount} />
              <IconCounter icon={Heart} to="/wishlist" label={t('header.wishlist')} count={wishlistCount} />
            </div>

            <span className="hidden h-6 w-px bg-header-line lg:block" />

            {user ? (
              <Link
                to="/account"
                title={user.name ? t('header.signedInAs', { name: user.name }) : t('header.yourAccount')}
                className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-header-muted hover:text-header-ink"
              >
                <User className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('header.myAccount')}</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-header-muted hover:text-header-ink"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                {t('header.login')}
              </Link>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? t('header.closeMenu') : t('header.openMenu')}
              aria-expanded={menuOpen}
              className="rounded-md p-1.5 text-header-ink hover:bg-header-line lg:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-header-line px-3 pb-4 pt-3 lg:hidden">
            <div className="md:hidden">
              <SearchBar />
            </div>

            <nav className="mt-3 flex flex-col gap-2.5">
              {categoryList.map((category) => (
                <NavLink
                  key={category.id}
                  to={`/category/${category.slug}`}
                  className="text-sm font-medium text-header-ink"
                  onClick={() => setMenuOpen(false)}
                >
                  {category.name}
                </NavLink>
              ))}

              <NavLink to="/track" className="text-sm font-medium text-header-ink" onClick={() => setMenuOpen(false)}>
                {t('header.orderTrack')}
              </NavLink>

              {user ? (
                <NavLink to="/account" className="text-sm font-medium text-header-ink" onClick={() => setMenuOpen(false)}>
                  {t('header.myAccount')}
                </NavLink>
              ) : (
                <NavLink to="/register" className="text-sm font-medium text-header-ink" onClick={() => setMenuOpen(false)}>
                  {t('header.createAccount')}
                </NavLink>
              )}
            </nav>
          </div>
        )}
      </header>

      <CategoryBar />
    </>
  )
}

export function StorefrontLayout() {
  const { data: settings } = useStoreSettings()
  const cartCount = useCartCount()
  const openCart = useCartDrawer((state) => state.show)
  const user = useAuthStore((state) => state.user)
  const [menuOpen, setMenuOpen] = useState(false)

  useFavicon(settings?.store_favicon)
  useAnalytics({
    googleSiteVerification: settings?.google_site_verification,
    googleAnalyticsId: settings?.google_analytics_id,
  })
  useCustomScripts({
    headerScripts: settings?.custom_header_scripts,
    footerScripts: settings?.custom_footer_scripts,
  })

  const HeaderComponent = settings?.store_header_style === 'classic' ? ClassicHeader : CategoriesHeader

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <HeaderComponent
        settings={settings}
        cartCount={cartCount}
        user={user}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
      />

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-4 sm:px-4">
        <Outlet />
      </main>

      <Footer settings={settings} />

      <div className="fixed bottom-5 right-5 z-40 flex flex-col gap-3">
        {/* Only rendered when the owner has actually set a WhatsApp number --
            a chat button that opens an empty conversation is worse than none. */}
        {settings?.store_whatsapp && (
          <a
            href={`https://wa.me/${settings.store_whatsapp.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer noopener"
            aria-label="Chat on WhatsApp"
            className="grid h-12 w-12 place-items-center rounded-full bg-[#25d366] text-white shadow-raised transition-transform hover:scale-105"
          >
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
          </a>
        )}
      </div>

      {/*
         A tab on the edge of the window rather than a button in the corner:
         it stays in one place down the whole page, and the count is spelled
         out instead of squeezed into a dot.
      */}
      <button
        type="button"
        onClick={openCart}
        aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
        className="fixed right-0 top-1/2 z-40 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-lg bg-brand-600 px-2.5 py-3.5 text-white shadow-raised transition-colors hover:bg-brand-700"
      >
        <ShoppingBag className="h-5 w-5" aria-hidden="true" />
        <span className="tabular whitespace-nowrap text-[11px] font-semibold leading-none">
          {cartCount} {cartCount === 1 ? 'Item' : 'Items'}
        </span>
      </button>

      <CartDrawer />
    </div>
  )
}
