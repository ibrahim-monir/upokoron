import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronDown,
  Heart,
  LogIn,
  Menu,
  MessageCircle,
  Package,
  Phone,
  Search,
  ShoppingCart,
  User,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { get } from '../lib/api'
import { cx } from '../lib/format'
import { useFavicon } from '../lib/useFavicon'
import { useAuthStore } from '../stores/authStore'
import { Logo } from '../components/Logo'
import { useCartCount } from '../features/cart/useCart'
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

function SearchBar({ className }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [term, setTerm] = useState(params.get('search') ?? '')

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        navigate(term.trim() ? `/products?search=${encodeURIComponent(term.trim())}` : '/products')
      }}
      className={cx('relative', className)}
    >
      <input
        type="search"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search product"
        aria-label="Search products"
        className="h-11 w-full rounded-md border-0 bg-white pl-4 pr-14 text-sm text-ink-900 placeholder:text-ink-400"
      />
      <button
        type="submit"
        aria-label="Search"
        // brand-800, not brand-600: the button sits on a brand-600 bar and
        // needs to separate from it.
        className="absolute right-1 top-1 grid h-9 w-11 place-items-center rounded-md bg-brand-800 text-white transition-colors hover:bg-brand-900"
      >
        <Search className="h-4.5 w-4.5" aria-hidden="true" />
      </button>
    </form>
  )
}

/**
 * Counter badges sit on the cart and wishlist icons.
 *
 * The cart count is real, read from the server's copy of the basket. The
 * wishlist still reads 0 because that feature has no backend -- which is the
 * true number, not a placeholder.
 */
function IconCounter({ icon: Icon, count = 0, label, to }) {
  return (
    // White on the brand bar. These were dark-on-blue after the header
    // switched back from a white row -- the label was barely legible and the
    // badge was brand-600 on brand-600, so it vanished entirely.
    <Link to={to} className="relative flex items-center gap-1.5 text-white/95 hover:text-white">
      <span className="relative">
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-brand-700">
          {count}
        </span>
      </span>
      {label && <span className="hidden whitespace-nowrap text-sm font-medium lg:inline">{label}</span>}
    </Link>
  )
}

/**
 * The original header: logo, search, and a Shop/Offers/Contact nav in one
 * bar. Kept working, not just around -- store_header_style switches back to
 * this from Admin -> Settings any time, so it cannot be allowed to rot.
 */
function ClassicHeader({ settings, cartCount, user, logout, navigate, menuOpen, setMenuOpen }) {
  return (
    <header className="sticky top-0 z-30 bg-brand-600 shadow-sm">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-3 sm:px-4 lg:gap-5">
        <Logo settings={settings} variant="light" />

        <SearchBar className="hidden max-w-sm flex-1 md:block lg:max-w-md" />

        <nav className="hidden items-center gap-5 lg:flex">
          <NavLink to="/products" className="whitespace-nowrap text-sm font-medium text-white/95 hover:text-white">
            Shop
          </NavLink>
          <NavLink
            to="/products?sort=oldest"
            className="whitespace-nowrap text-sm font-medium text-white/95 hover:text-white"
          >
            Offers
          </NavLink>
          <NavLink to="/contact" className="whitespace-nowrap text-sm font-medium text-white/95 hover:text-white">
            Contact
          </NavLink>
        </nav>

        <div className="ml-auto flex items-center gap-3 lg:gap-4">
          <div className="hidden items-center gap-4 sm:flex">
            <IconCounter icon={ShoppingCart} to="/cart" label="Cart" count={cartCount} />
            <IconCounter icon={Heart} to="/products" />
          </div>

          <span className="hidden h-6 w-px bg-white/25 lg:block" />

          {user ? (
            <div className="flex items-center gap-3">
              <Link
                to="/account"
                className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white/95 hover:text-white"
              >
                <User className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{user.name?.split(' ')[0]}</span>
              </Link>
              <button
                type="button"
                onClick={async () => {
                  await logout()
                  navigate('/')
                }}
                className="hidden whitespace-nowrap text-sm font-medium text-white/75 hover:text-white lg:block"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white/95 hover:text-white"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Sign in
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
                My account
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

/** Support phone + hours on the left, account shortcuts on the right. Hidden on phones -- there is no room, and a tel: link is one tap away in the mobile menu instead. */
function TopBar({ settings }) {
  return (
    <div className="hidden bg-ink-900 text-white sm:block">
      <div className="mx-auto flex h-9 max-w-[1400px] items-center justify-between px-3 text-xs sm:px-4">
        <div>
          {settings?.store_phone ? (
            <a href={`tel:${settings.store_phone}`} className="flex items-center gap-1.5 text-white/90 hover:text-white">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="font-medium">{settings.store_phone}</span>
              {settings.store_support_hours && (
                <span className="text-white/60">· {settings.store_support_hours}</span>
              )}
            </a>
          ) : (
            <span />
          )}
        </div>

        <nav className="flex items-center gap-4">
          <Link to="/orders" className="flex items-center gap-1.5 text-white/90 hover:text-white">
            <Package className="h-3.5 w-3.5" aria-hidden="true" />
            Order Track
          </Link>
        </nav>
      </div>
    </div>
  )
}

/** Every top-level category along the bottom, its children in a hover mega menu. Desktop only -- the mobile sheet lists categories flatly instead. */
function CategoryBar() {
  const categories = useStoreCategories()
  const [openId, setOpenId] = useState(null)

  const list = categories.data ?? []

  if (categories.isLoading || list.length === 0) return null

  return (
    <nav aria-label="Categories" className="hidden border-b border-ink-200 bg-white lg:block">
      <div className="mx-auto flex max-w-[1400px] items-stretch px-3 sm:px-4">
        {list.map((category) => {
          const hasChildren = (category.children ?? []).length > 0

          return (
            <div
              key={category.id}
              className="relative"
              onMouseEnter={() => setOpenId(category.id)}
              onMouseLeave={() => setOpenId((current) => (current === category.id ? null : current))}
            >
              <Link
                to={`/products?category=${category.slug}`}
                className="flex items-center gap-1 whitespace-nowrap px-3 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50 hover:text-brand-700"
              >
                {category.name}
                {hasChildren && <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
              </Link>

              {hasChildren && openId === category.id && (
                <div className="absolute left-0 top-full z-40 min-w-56 rounded-b-lg border border-t-0 border-ink-200 bg-white py-2 shadow-raised">
                  <ul className="flex flex-col">
                    {category.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          to={`/products?category=${child.slug}`}
                          className="block px-4 py-2 text-sm text-ink-700 hover:bg-brand-50 hover:text-brand-700"
                        >
                          {child.name}
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

function CategoriesHeader({ settings, cartCount, user, logout, navigate, menuOpen, setMenuOpen }) {
  const categories = useStoreCategories()
  const categoryList = categories.data ?? []

  return (
    <>
      <TopBar settings={settings} />

      <header className="sticky top-0 z-30 bg-brand-600 shadow-sm">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-3 sm:px-4 lg:gap-5">
          <Logo settings={settings} variant="light" />

          <SearchBar className="hidden max-w-sm flex-1 md:block lg:max-w-md" />

          <div className="ml-auto flex items-center gap-3 lg:gap-4">
            <div className="hidden items-center gap-4 sm:flex">
              <IconCounter icon={ShoppingCart} to="/cart" label="Cart" count={cartCount} />
              <IconCounter icon={Heart} to="/products" />
            </div>

            <span className="hidden h-6 w-px bg-white/25 lg:block" />

            {user ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/account"
                  className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white/95 hover:text-white"
                >
                  <User className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{user.name?.split(' ')[0]}</span>
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await logout()
                    navigate('/')
                  }}
                  className="hidden whitespace-nowrap text-sm font-medium text-white/75 hover:text-white lg:block"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <Link
                to="/login"
                className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-white/95 hover:text-white"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Sign in
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
                  to={`/products?category=${category.slug}`}
                  className="text-sm font-medium text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  {category.name}
                </NavLink>
              ))}

              <NavLink to="/orders" className="text-sm font-medium text-white" onClick={() => setMenuOpen(false)}>
                Order Track
              </NavLink>

              {user ? (
                <NavLink to="/account" className="text-sm font-medium text-white" onClick={() => setMenuOpen(false)}>
                  My account
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
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useFavicon(settings?.store_favicon)

  const HeaderComponent = settings?.store_header_style === 'classic' ? ClassicHeader : CategoriesHeader

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <HeaderComponent
        settings={settings}
        cartCount={cartCount}
        user={user}
        logout={logout}
        navigate={navigate}
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

        {/* Floating cart, as in the reference. */}
        <Link
          to="/cart"
          aria-label={`Cart, ${cartCount} item${cartCount === 1 ? '' : 's'}`}
          className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-raised ring-1 ring-ink-200 hover:ring-brand-300"
        >
          <span className="relative">
            <ShoppingCart className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <span className="absolute -right-2.5 -top-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
              {cartCount}
            </span>
          </span>
        </Link>
      </div>
    </div>
  )
}
