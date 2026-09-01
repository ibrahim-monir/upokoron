import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowRight,
  ChevronDown,
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
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { get } from '../lib/api'
import { cx, money } from '../lib/format'
import { useAnalytics } from '../lib/useAnalytics'
import { useCustomScripts } from '../lib/useCustomScripts'
import { useFavicon } from '../lib/useFavicon'
import { useAuthStore } from '../stores/authStore'
import { Logo } from '../components/Logo'
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
 */
function buildSearchPhrases(products) {
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
    names.length > 0 && `product (${names.join(', ')})`,
    brands.length > 0 && `brand (${brands.join(', ')})`,
    categories.length > 0 && `category (${categories.join(', ')})`,
  ].filter(Boolean)
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
      const phrase = phrases[phraseIndex % phrases.length]

      if (phase === 'typing') {
        charIndex += 1
        setSuffix(phrase.slice(0, charIndex))
        phase = charIndex >= phrase.length ? 'holding' : 'typing'
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
        setSuffix(phrase.slice(0, charIndex))

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
  const searchPhrases = useMemo(() => buildSearchPhrases(examples.data ?? []), [examples.data])
  const typedPlaceholder = useTypedPlaceholder('Search by ', searchPhrases)

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
          placeholder={searchPhrases.length > 0 ? typedPlaceholder : 'Search product'}
          aria-label="Search products"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="h-11 w-full rounded-md border-0 bg-white pl-4 pr-14 text-sm text-ink-900 placeholder:text-ink-400"
        />

        <button
          type="submit"
          aria-label="Search"
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
              {suggestions.isFetching ? 'Searching…' : `Nothing matches “${query}”.`}
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
                            <span className="text-[11px] text-danger-700">Out of stock</span>
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
                See all {total} result{total === 1 ? '' : 's'}
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
  const wishlistCount = useWishlistCount()
  const openCart = useCartDrawer((state) => state.show)

  return (
    <header className="sticky top-0 z-30 bg-navy-900 shadow-sm">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-3 sm:px-4 lg:gap-5">
        <Logo settings={settings} variant="light" />

        <SearchBar className="hidden max-w-sm flex-1 md:block lg:max-w-md" />

        <nav className="hidden items-center gap-5 lg:flex">
          <NavLink to="/products" className="whitespace-nowrap text-sm font-semibold text-white/95 hover:text-white">
            Shop
          </NavLink>
          <NavLink
            to="/products?sort=oldest"
            className="whitespace-nowrap text-sm font-semibold text-white/95 hover:text-white"
          >
            Offers
          </NavLink>
          <NavLink to="/contact" className="whitespace-nowrap text-sm font-semibold text-white/95 hover:text-white">
            Contact
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:gap-4">
          <div className="hidden items-center gap-4 sm:flex">
            <IconCounter icon={ShoppingCart} onClick={openCart} label="Cart" count={cartCount} />
            <IconCounter icon={Heart} to="/wishlist" label="Wishlist" count={wishlistCount} />
          </div>

          <span className="hidden h-6 w-px bg-white/25 lg:block" />

          {user ? (
            <Link
              to="/account"
              title={user.name ? `Signed in as ${user.name}` : 'Your account'}
              className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white/95 hover:text-white"
            >
              <User className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">My Account</span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white/95 hover:text-white"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Login
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="rounded-md p-1.5 text-white hover:bg-white/15 lg:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-white/15 px-3 pb-4 pt-3 lg:hidden">
          <div className="md:hidden">
            <SearchBar />
          </div>

          <nav className="mt-3 flex flex-col gap-2.5">
            <NavLink to="/products" className="text-sm font-medium text-white" onClick={() => setMenuOpen(false)}>
              Shop
            </NavLink>
            <NavLink
              to="/products?sort=oldest"
              className="text-sm font-medium text-white"
              onClick={() => setMenuOpen(false)}
            >
              Offers
            </NavLink>
            <NavLink to="/contact" className="text-sm font-medium text-white" onClick={() => setMenuOpen(false)}>
              Contact
            </NavLink>

            {user ? (
              <NavLink to="/account" className="text-sm font-medium text-white" onClick={() => setMenuOpen(false)}>
                My Account
              </NavLink>
            ) : (
              <NavLink to="/register" className="text-sm font-medium text-white" onClick={() => setMenuOpen(false)}>
                Create account
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
  const rewardsOn = useRewardsAdvertised()

  return (
    <div className="hidden border-b border-white/10 bg-[#1C61E7] text-white sm:block">
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
                Earn rewards
              </Link>
            )}

            <Link to="/track" className="flex items-center gap-1.5 text-white/90 hover:text-white">
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              Order Track
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
 * Hover intent.
 *
 * Closing the panel the instant the pointer leaves the trigger makes it
 * unreachable: the natural path to a menu item is diagonal, and it clips the
 * gap between trigger and panel on the way. A short grace period is the
 * difference between a menu that feels considered and one that fights back.
 */
function useHoverIntent(delay = 140) {
  const [openId, setOpenId] = useState(null)
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  // Stable identities: these end up in an effect's dependency list, and a
  // fresh function every render would re-subscribe the key handler forever.
  const open = useCallback((id) => {
    clearTimeout(timer.current)
    setOpenId(id)
  }, [])

  const close = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpenId(null), delay)
  }, [delay])

  const closeNow = useCallback(() => {
    clearTimeout(timer.current)
    setOpenId(null)
  }, [])

  return { openId, open, close, closeNow }
}

/** Every top-level category along the bottom, its children in a hover mega menu. Desktop only -- the mobile sheet lists categories flatly instead. */
function CategoryBar() {
  const categories = useStoreCategories()
  const { openId, open, close, closeNow } = useHoverIntent()
  const { pathname } = useLocation()

  const list = categories.data ?? []

  // Escape closes it, the same as every other overlay on the page.
  useEffect(() => {
    if (openId === null) return undefined

    const onKey = (event) => {
      if (event.key === 'Escape') closeNow()
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [openId, closeNow])

  // The home page already leads with its own "Shop by category" section --
  // repeating the same list as a menu bar right above it is redundant.
  // Every other page has no such section of its own, so the bar is how a
  // visitor gets back to browsing by category from there.
  if (categories.isLoading || list.length === 0 || pathname === '/') return null

  return (
    <nav aria-label="Categories" className="hidden border-b border-ink-200 bg-white lg:block">
      <div className="mx-auto flex max-w-[1400px] items-stretch gap-1 px-3 sm:px-4">
        {list.map((category) => {
          const children = category.children ?? []
          const hasChildren = children.length > 0
          const isOpen = openId === category.id
          const isActive = pathname === `/category/${category.slug}`

          return (
            <div
              key={category.id}
              className="relative"
              onMouseEnter={() => open(category.id)}
              onMouseLeave={close}
              onFocus={() => open(category.id)}
            >
              <Link
                to={`/category/${category.slug}`}
                aria-expanded={hasChildren ? isOpen : undefined}
                aria-current={isActive ? 'page' : undefined}
                className={cx(
                  'relative flex items-center gap-1 whitespace-nowrap px-3 py-3 text-sm font-semibold uppercase transition-colors duration-150',
                  isActive || isOpen ? 'text-brand-800' : 'text-ink-700 hover:text-brand-800',
                )}
              >
                {category.name}

                {hasChildren && (
                  <ChevronDown
                    className={cx(
                      'h-3.5 w-3.5 transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                    aria-hidden="true"
                  />
                )}

                {/*
                   The active mark is a rule that grows out of the centre
                   rather than a block of fill behind the text. Orange,
                   because this is exactly the "active state" the palette
                   reserves it for, and on a white bar it should be the one
                   thing that pulls the eye.
                */}
                <span
                  aria-hidden="true"
                  className={cx(
                    'pointer-events-none absolute inset-x-3 bottom-0 h-0.5 origin-center rounded-full bg-brand-600 transition-transform duration-200 ease-out',
                    isActive || isOpen ? 'scale-x-100' : 'scale-x-0',
                  )}
                />
              </Link>

              {hasChildren && isOpen && (
                <div
                  onMouseEnter={() => open(category.id)}
                  onMouseLeave={close}
                  className={cx(
                    'absolute left-0 top-full z-40 overflow-hidden rounded-b-xl border border-t-0 border-ink-200 bg-white shadow-raised',
                    children.length > 4 ? 'w-[26rem]' : 'w-64',
                  )}
                >
                  <div className="flex items-center justify-between gap-3 border-b border-ink-100 bg-ink-50 px-4 py-3">
                    <span className="flex min-w-0 items-center gap-2.5">
                      {category.image ? (
                        <img src={category.image} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-brand-50 text-[11px] font-bold text-brand-800">
                          {category.name.charAt(0)}
                        </span>
                      )}

                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink-900">
                          {category.name}
                        </span>

                        {category.product_count > 0 && (
                          <span className="block text-[11px] text-ink-500">
                            {category.product_count} product
                            {category.product_count === 1 ? '' : 's'}
                          </span>
                        )}
                      </span>
                    </span>

                    <Link
                      to={`/category/${category.slug}`}
                      onClick={closeNow}
                      className="group/all flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-brand-800 hover:text-brand-900"
                    >
                      View all
                      <ArrowRight
                        className="h-3.5 w-3.5 transition-transform duration-150 group-hover/all:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Link>
                  </div>

                  <ul
                    className={cx(
                      'grid gap-0.5 p-2',
                      children.length > 4 ? 'grid-cols-2' : 'grid-cols-1',
                    )}
                  >
                    {children.map((child) => (
                      <li key={child.id}>
                        <Link
                          to={`/category/${child.slug}`}
                          onClick={closeNow}
                          className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
                        >
                          <span className="truncate">{child.name}</span>

                          {child.product_count > 0 && (
                            <span className="shrink-0 text-[11px] tabular-nums text-ink-400">
                              {child.product_count}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}

function CategoriesHeader({ settings, cartCount, user, menuOpen, setMenuOpen }) {
  const wishlistCount = useWishlistCount()
  const openCart = useCartDrawer((state) => state.show)

  const categories = useStoreCategories()
  const categoryList = categories.data ?? []

  return (
    <>
      <TopBar settings={settings} />

      <header className="sticky top-0 z-30 bg-navy-900 shadow-sm">
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
            <div className="hidden items-center gap-4 sm:flex">
              <IconCounter icon={ShoppingCart} onClick={openCart} label="Cart" count={cartCount} />
              <IconCounter icon={Heart} to="/wishlist" label="Wishlist" count={wishlistCount} />
            </div>

            <span className="hidden h-6 w-px bg-white/25 lg:block" />

            {user ? (
              <Link
                to="/account"
                title={user.name ? `Signed in as ${user.name}` : 'Your account'}
                className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white/95 hover:text-white"
              >
                <User className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">My Account</span>
              </Link>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white/95 hover:text-white"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Login
              </Link>
            )}

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              className="rounded-md p-1.5 text-white hover:bg-white/15 lg:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-white/15 px-3 pb-4 pt-3 lg:hidden">
            <div className="md:hidden">
              <SearchBar />
            </div>

            <nav className="mt-3 flex flex-col gap-2.5">
              {categoryList.map((category) => (
                <NavLink
                  key={category.id}
                  to={`/category/${category.slug}`}
                  className="text-sm font-medium text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  {category.name}
                </NavLink>
              ))}

              <NavLink to="/track" className="text-sm font-medium text-white" onClick={() => setMenuOpen(false)}>
                Order Track
              </NavLink>

              {user ? (
                <NavLink to="/account" className="text-sm font-medium text-white" onClick={() => setMenuOpen(false)}>
                  My Account
                </NavLink>
              ) : (
                <NavLink to="/register" className="text-sm font-medium text-white" onClick={() => setMenuOpen(false)}>
                  Create account
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
