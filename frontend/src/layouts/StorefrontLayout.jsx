import { Link, NavLink, Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Globe, Heart, LogIn, Menu, MessageCircle, Search, ShoppingCart, User, X } from 'lucide-react'
import { useState } from 'react'
import { get } from '../lib/api'
import { cx } from '../lib/format'
import { useAuthStore } from '../stores/authStore'
import { Logo } from '../components/Logo'
import { Footer } from './Footer'

function useStoreSettings() {
  return useQuery({
    queryKey: ['shop', 'settings'],
    queryFn: () => get('/shop/settings'),
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
        className="h-11 w-full rounded-md border border-ink-300 bg-white pl-4 pr-14 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-500"
      />
      <button
        type="submit"
        aria-label="Search"
        className="absolute right-1 top-1 grid h-9 w-11 place-items-center rounded-md bg-brand-600 text-white transition-colors hover:bg-brand-700"
      >
        <Search className="h-4.5 w-4.5" aria-hidden="true" />
      </button>
    </form>
  )
}

/**
 * Counter badges sit on the cart and wishlist icons.
 *
 * They read 0 because neither feature has a backend yet -- that is the true
 * number, not a placeholder. When the cart module lands it feeds this.
 */
function IconCounter({ icon: Icon, count = 0, label, to }) {
  return (
    <Link to={to} className="relative flex items-center gap-1.5 text-ink-700 hover:text-brand-600">
      <span className="relative">
        <Icon className="h-5 w-5" aria-hidden="true" />
        <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      </span>
      {label && <span className="hidden text-sm font-medium lg:inline">{label}</span>}
    </Link>
  )
}

export function StorefrontLayout() {
  const { data: settings } = useStoreSettings()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const storeName = settings?.store_name ?? 'Upokoron'

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      {/*
        The top row is white so the logo can appear in its own colours -- its
        wordmark is near-black and vanishes against the brand blue. The blue
        moves to the nav strip below and to every control, so the brand is
        still the loudest thing on the page.
      */}
      <header className="sticky top-0 z-30 shadow-sm">
        <div className="bg-white">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-3 sm:px-4">
            <Logo settings={settings} />

            <SearchBar className="hidden max-w-lg flex-1 md:block" />

            <div className="ml-auto flex items-center gap-4">
              <div className="hidden items-center gap-4 sm:flex">
                <IconCounter icon={ShoppingCart} to="/products" label="কার্ট দেখুন" />
                <IconCounter icon={Heart} to="/products" />
              </div>

              <span className="hidden h-6 w-px bg-ink-200 lg:block" />

              {user ? (
                <div className="flex items-center gap-3">
                  <Link
                    to="/account"
                    className="flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-brand-600"
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
                    className="hidden text-sm font-medium text-ink-500 hover:text-ink-900 sm:block"
                  >
                    লগ আউট
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="flex items-center gap-1.5 text-sm font-medium text-ink-700 hover:text-brand-600"
                >
                  <LogIn className="h-4 w-4" aria-hidden="true" />
                  লগ ইন
                </Link>
              )}

              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                className="rounded-md p-1.5 text-ink-700 hover:bg-ink-100 md:hidden"
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="hidden bg-brand-600 md:block">
          <nav className="mx-auto flex h-11 max-w-[1400px] items-center gap-6 px-3 sm:px-4">
            <NavLink to="/products" className="text-sm font-medium text-white/95 hover:text-white">
              শপিং
            </NavLink>
            <NavLink to="/products?sort=oldest" className="text-sm font-medium text-white/95 hover:text-white">
              অফার সমূহ
            </NavLink>
            <NavLink to="/contact" className="text-sm font-medium text-white/95 hover:text-white">
              যোগাযোগ
            </NavLink>

            <button
              type="button"
              className="ml-auto flex items-center gap-1.5 text-sm font-medium text-white/95 hover:text-white"
              title="Bangla and English are planned"
            >
              <Globe className="h-4 w-4" aria-hidden="true" />
              Language
            </button>
          </nav>
        </div>

        {menuOpen && (
          <div className="border-t border-ink-200 bg-white px-3 pb-4 pt-3 md:hidden">
            <SearchBar />
            <nav className="mt-3 flex flex-col gap-2.5">
              <NavLink to="/products" className="text-sm font-medium text-ink-800" onClick={() => setMenuOpen(false)}>
                শপিং
              </NavLink>
              <NavLink to="/contact" className="text-sm font-medium text-ink-800" onClick={() => setMenuOpen(false)}>
                যোগাযোগ
              </NavLink>
              {user ? (
                <NavLink to="/account" className="text-sm font-medium text-ink-800" onClick={() => setMenuOpen(false)}>
                  My account
                </NavLink>
              ) : (
                <>
                  <NavLink to="/login" className="text-sm font-medium text-ink-800" onClick={() => setMenuOpen(false)}>
                    লগ ইন
                  </NavLink>
                  <NavLink to="/register" className="text-sm font-medium text-ink-800" onClick={() => setMenuOpen(false)}>
                    Create account
                  </NavLink>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

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

        {/* Floating cart, as in the reference. Goes to the catalogue until
            the cart module exists. */}
        <Link
          to="/products"
          aria-label="Cart"
          className="grid h-12 w-12 place-items-center rounded-full bg-white shadow-raised ring-1 ring-ink-200 hover:ring-brand-300"
        >
          <span className="relative">
            <ShoppingCart className="h-5 w-5 text-brand-600" aria-hidden="true" />
            <span className="absolute -right-2.5 -top-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
              0
            </span>
          </span>
        </Link>
      </div>
    </div>
  )
}
