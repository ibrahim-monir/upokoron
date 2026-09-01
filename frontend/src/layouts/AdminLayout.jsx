import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  BookOpen,
  Boxes,
  ChevronDown,
  CreditCard,
  FileText,
  Gift,
  Globe,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Store,
  Tag,
  Truck,
  UserPlus,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { get } from '../lib/api'
import { cx, initials } from '../lib/format'
import { useAuthStore } from '../stores/authStore'

const SECTIONS = [
  {
    label: null,
    items: [
      { to: '/admin', end: true, icon: LayoutDashboard, label: 'Dashboard', can: 'dashboard.view' },
      {
        to: '/admin/orders',
        icon: ReceiptText,
        label: 'Orders',
        can: 'orders.view',
        badge: 'pendingOrders',
        prominent: true,
      },
      // Top level rather than inside a group: images are picked from
      // products, banners, categories and settings alike, so filing it under
      // any one of those made it a detour from all the others.
      { to: '/admin/media', icon: ImageIcon, label: 'Media library', can: 'media.view' },
      { to: '/admin/settings', icon: Settings, label: 'Settings', can: 'settings.manage' },
      { to: '/admin/sitemap', icon: Globe, label: 'Sitemap', can: 'sitemap.manage' },
    ],
  },
  {
    // Named for the stock rather than the catalogue: /admin/inventory is
    // only a redirect to this list now, because what you sell and what is
    // on the shelf are the same screen.
    label: 'Inventory',
    icon: Boxes,
    items: [
      {
        to: '/admin/products',
        icon: Package,
        label: 'All Products',
        can: ['products.view', 'inventory.view'],
      },
      { to: '/admin/categories', icon: Shapes, label: 'Category', can: 'products.view' },
      { to: '/admin/brands', icon: Store, label: 'Brands', can: 'products.view' },
      // Not Shapes: Categories already uses it, and two rows in one group
      // with the same icon give the eye nothing to tell them apart by.
      { to: '/admin/attributes', icon: SlidersHorizontal, label: 'Attributes', can: 'products.view' },
    ],
  },
  {
    label: 'Operations',
    icon: Layers,
    items: [
      { to: '/admin/shipping', icon: Truck, label: 'Delivery', can: 'shipping.manage' },
      { to: '/admin/payment-methods', icon: CreditCard, label: 'Payments', can: 'payments.manage' },
    ],
  },
  {
    label: 'Marketing',
    icon: Megaphone,
    items: [
      { to: '/admin/banners', icon: ImageIcon, label: 'Banners', can: 'banners.manage' },
      { to: '/admin/coupons', icon: Tag, label: 'Coupons', can: 'coupons.manage' },
      { to: '/admin/reviews', icon: Star, label: 'Reviews', can: 'reviews.view' },
      { to: '/admin/contact-messages', icon: Mail, label: 'Messages', can: 'contact.view' },
      { to: '/admin/faqs', icon: HelpCircle, label: 'FAQ', can: 'faqs.manage' },
      { to: '/admin/rewards', icon: Gift, label: 'Reward Points', can: 'rewards.view' },
    ],
  },
  {
    label: 'Finance',
    icon: Wallet,
    items: [
      { to: '/admin/accounts', icon: BookOpen, label: 'Chart of accounts', can: 'accounting.view' },
      { to: '/admin/journal', icon: ScrollText, label: 'Journal', can: 'accounting.view' },
      { to: '/admin/reports/trial-balance', icon: FileText, label: 'Trial balance', can: 'accounting.view' },
      { to: '/admin/reports/profit-loss', icon: BarChart3, label: 'Profit & loss', can: 'accounting.view' },
    ],
  },
  {
    label: 'Users',
    icon: Users,
    items: [
      // `end`, or this stays highlighted while Add new user is open --
      // /admin/users is a prefix of /admin/users/new.
      { to: '/admin/users', end: true, icon: Users, label: 'All users', can: 'users.view' },
      { to: '/admin/users/new', icon: UserPlus, label: 'Add new user', can: 'users.manage' },
      { to: '/admin/roles', icon: ShieldCheck, label: 'Role manage', can: 'roles.manage' },
    ],
  },
]

function NavItem({ item, onNavigate, prominent = false, badge = 0, inset = false }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center gap-3 rounded-lg pr-3 transition-colors',
          prominent ? 'h-11' : 'h-10',
          // Indented under its group header, so a row reads as belonging to
          // the heading above it rather than sitting at the same level.
          inset ? 'pl-7' : 'pl-3',
          isActive
            ? 'bg-brand-600 text-white shadow-sm'
            : 'text-slate-300 hover:bg-white/[0.06] hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cx(
              'grid shrink-0 place-items-center rounded-md',
              prominent ? 'h-8 w-8' : 'h-7 w-7',
              isActive ? 'bg-white/20 text-white' : 'text-slate-400 group-hover:text-white',
            )}
          >
            <Icon className={prominent ? 'h-[17px] w-[17px]' : 'h-4 w-4'} />
          </span>

          <span
            className={cx(
              'min-w-0 flex-1 truncate text-sm',
              isActive ? 'font-semibold' : 'font-medium',
            )}
          >
            {item.label}
          </span>

          {/*
             The count is the point of this slot when there is one: a bare
             dot says "something is here" and makes you open the page to
             find out how much. 99+ so a busy day cannot widen the rail.
          */}
          {badge > 0 ? (
            <span
              title={`${badge} order${badge === 1 ? '' : 's'} pending`}
              className={cx(
                'ml-auto grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full px-1.5',
                'text-[11px] font-bold tabular-nums leading-none',
                isActive
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30',
              )}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          ) : (
            prominent && (
              <span
                className={cx(
                  'h-1.5 w-1.5 rounded-full',
                  isActive ? 'bg-white' : 'bg-transparent',
                )}
              />
            )
          )}
        </>
      )}
    </NavLink>
  )
}

/**
 * How many orders are still waiting to be dealt with.
 *
 * Read off the orders list rather than a bespoke endpoint: that response
 * already carries a status breakdown, so `per_page=1` buys the count for
 * one row of payload instead of a second query the backend would have to
 * grow. Skipped entirely for an account that cannot see orders -- polling
 * a 403 every minute helps nobody.
 */
function usePendingOrderCount(enabled) {
  const query = useQuery({
    queryKey: ['admin', 'orders', 'pending-count'],
    queryFn: () => get('/admin/orders', { params: { per_page: 1 } }),
    enabled,
    // The sidebar is on screen all day; a stale badge is worse than a
    // cheap refetch, but a tight poll would be noise.
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  return query.data?.summary?.by_status?.pending?.orders ?? 0
}

function NavSection({ section, visibleItems, pathname, badges, onNavigate }) {
  const Icon = section.icon
  const hasActiveItem = visibleItems.some((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  )
  const [open, setOpen] = useState(hasActiveItem)

  useEffect(() => {
    if (hasActiveItem) setOpen(true)
  }, [hasActiveItem])

  if (!section.label) {
    return (
      <div className="space-y-1">
        {visibleItems.map((item) => (
          <NavItem
            key={item.to}
            item={item}
            prominent={Boolean(item.prominent)}
            badge={item.badge ? badges?.[item.badge] : 0}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    )
  }

  /*
   * No rule between groups. Now that a header is built like a nav row, the
   * whole rail is one list, and the gap does the separating: 12px between
   * groups against 2px inside one is difference enough to read.
   */
  return (
    <div>
      {/*
         Built to the same spec as NavItem -- same height, icon tile, text
         size and hover. A group header is a thing you click to get
         somewhere, so it should not be styled as a caption while the rows
         under it are styled as controls.
      */}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cx(
          'group mb-1 flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors',
          hasActiveItem
            ? 'text-white'
            : 'text-slate-300 hover:bg-white/[0.06] hover:text-white',
        )}
        aria-expanded={open}
      >
        <span
          className={cx(
            'grid h-7 w-7 shrink-0 place-items-center rounded-md',
            hasActiveItem ? 'text-white' : 'text-slate-400 group-hover:text-white',
          )}
        >
          {Icon ? <Icon className="h-4 w-4" /> : null}
        </span>

        <span
          className={cx(
            'min-w-0 flex-1 truncate text-sm',
            hasActiveItem ? 'font-semibold' : 'font-medium',
          )}
        >
          {section.label}
        </span>

        <ChevronDown
          className={cx(
            'h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:text-white',
            !open && '-rotate-90',
          )}
          aria-hidden="true"
        />
      </button>

      <div
        className={cx(
          'overflow-hidden transition-[max-height,opacity] duration-200',
          open ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="space-y-0.5">
          {visibleItems.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              inset
              badge={item.badge ? badges?.[item.badge] : 0}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Sidebar({ onNavigate }) {
  const can = useAuthStore((state) => state.can)
  const { pathname } = useLocation()

  const pendingOrders = usePendingOrderCount(can('orders.view'))

  const badges = useMemo(
    () => ({ pendingOrders }),
    [pendingOrders],
  )

  const sections = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        visibleItems: section.items.filter((item) =>
          Array.isArray(item.can) ? item.can.some((name) => can(name)) : can(item.can),
        ),
      })).filter((section) => section.visibleItems.length),
    [can],
  )

  return (
    <nav className="space-y-3 px-3 py-4">
      {sections.map((section, index) => (
        <NavSection
          key={section.label ?? `primary-${index}`}
          section={section}
          visibleItems={section.visibleItems}
          pathname={pathname}
          badges={badges}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

export function AdminLayout() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  const closeMobile = () => setMobileOpen(false)

  return (
    <div className="min-h-screen bg-ink-50">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-50 flex w-[258px] flex-col bg-navy-950 text-white',
          'border-r border-navy-800/70 shadow-xl transition-transform duration-200',
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="flex h-[68px] shrink-0 items-center border-b border-navy-800/70 px-4">
          <NavLink
            to="/admin"
            onClick={closeMobile}
            className="flex min-w-0 items-center gap-3"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-white">
              <span className="text-sm font-black tracking-tight">U</span>
            </div>

            <div className="min-w-0">
              <p className="truncate text-base font-extrabold tracking-tight text-white">
                Upokoron
              </p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                Admin Console
              </p>
            </div>
          </NavLink>

          <button
            type="button"
            onClick={closeMobile}
            className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-color:#334155_transparent] [scrollbar-width:thin]">
          <Sidebar onNavigate={closeMobile} />
        </div>

        {/* User */}
        <div className="shrink-0 border-t border-navy-800/70 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[10px] font-bold text-white">
              {initials(user?.name ?? '')}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">
                {user?.name || 'Administrator'}
              </p>
              <p className="truncate text-[10px] text-slate-500">
                {user?.email ?? user?.phone ?? ''}
              </p>
            </div>

            <button
              type="button"
              onClick={async () => {
                await logout()
                navigate('/admin/login')
              }}
              title="Sign out"
              className="rounded-lg p-2 text-slate-400 hover:bg-white/[0.08] hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[258px]">
        <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-ink-200 bg-white/95 px-4 backdrop-blur lg:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="mr-3 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <NavLink
            to="/"
            className="hidden text-xs font-semibold text-slate-500 transition hover:text-brand-600 sm:block"
          >
            View storefront
          </NavLink>

          <div className="ml-auto relative">
            <button
              type="button"
              onClick={() => setAccountOpen((value) => !value)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              aria-expanded={accountOpen}
              aria-haspopup="menu"
            >
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-[10px] font-bold text-slate-700">
                {initials(user?.name ?? '')}
              </div>

              <div className="hidden text-left md:block">
                <p className="max-w-[150px] truncate text-xs font-semibold text-slate-800">
                  {user?.name || 'Administrator'}
                </p>
                <p className="text-[10px] text-slate-400">Administrator</p>
              </div>

              <ChevronDown
                className={cx(
                  'h-3.5 w-3.5 text-slate-400 transition-transform',
                  accountOpen && 'rotate-180',
                )}
              />
            </button>

            {accountOpen && (
              <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {user?.name || 'Administrator'}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-400">
                    {user?.email ?? user?.phone ?? ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await logout()
                    navigate('/admin/login')
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="min-w-0 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}