import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  BookOpen,
  Boxes,
  ChevronDown,
  CreditCard,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Gift,
  ScrollText,
  Settings,
  Shapes,
  ShieldCheck,
  Star,
  Store,
  Tag,
  Truck,
  Users,
  X,
} from 'lucide-react'
import { cx, initials } from '../lib/format'
import { useAuthStore } from '../stores/authStore'

const SECTIONS = [
  {
    label: null,
    items: [
      { to: '/admin', end: true, icon: LayoutDashboard, label: 'Dashboard', can: 'dashboard.view' },
      { to: '/admin/orders', icon: ReceiptText, label: 'Orders', can: 'orders.view' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { to: '/admin/products', icon: Package, label: 'Products', can: 'products.view' },
      { to: '/admin/categories', icon: Shapes, label: 'Categories', can: 'products.view' },
      { to: '/admin/brands', icon: Store, label: 'Brands', can: 'products.view' },
      { to: '/admin/attributes', icon: Shapes, label: 'Attributes', can: 'products.view' },
      { to: '/admin/media', icon: ImageIcon, label: 'Media library', can: 'media.view' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/admin/inventory', icon: Boxes, label: 'Inventory', can: 'inventory.view' },
      { to: '/admin/shipping', icon: Truck, label: 'Delivery', can: 'shipping.manage' },
      { to: '/admin/payment-methods', icon: CreditCard, label: 'Payments', can: 'payments.manage' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { to: '/admin/banners', icon: ImageIcon, label: 'Banners', can: 'banners.manage' },
      { to: '/admin/coupons', icon: Tag, label: 'Coupons', can: 'coupons.manage' },
      { to: '/admin/reviews', icon: Star, label: 'Reviews', can: 'reviews.view' },
      { to: '/admin/rewards', icon: Gift, label: 'Reward Points', can: 'rewards.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { to: '/admin/accounts', icon: BookOpen, label: 'Chart of accounts', can: 'accounting.view' },
      { to: '/admin/journal', icon: ScrollText, label: 'Journal', can: 'accounting.view' },
      { to: '/admin/reports/trial-balance', icon: FileText, label: 'Trial balance', can: 'accounting.view' },
      { to: '/admin/reports/profit-loss', icon: BarChart3, label: 'Profit & loss', can: 'accounting.view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/users', icon: Users, label: 'Users', can: 'users.view' },
      { to: '/admin/roles', icon: ShieldCheck, label: 'Roles & permissions', can: 'roles.manage' },
      { to: '/admin/settings', icon: Settings, label: 'Settings', can: 'settings.manage' },
      { to: '/admin/audit-logs', icon: ScrollText, label: 'Audit log', can: 'audit.view' },
    ],
  },
]

function NavItem({ item, onNavigate, prominent = false }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          'group relative flex items-center gap-3 rounded-lg px-3 transition-colors',
          prominent ? 'h-11' : 'h-10',
          isActive
            ? prominent
              ? 'bg-white text-slate-950 shadow-sm'
              : 'bg-white/[0.075] text-white'
            : 'text-slate-400 hover:bg-white/[0.045] hover:text-slate-100',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !prominent && (
            <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-400" />
          )}

          <span
            className={cx(
              'grid shrink-0 place-items-center rounded-md',
              prominent ? 'h-8 w-8' : 'h-7 w-7',
              isActive
                ? prominent
                  ? 'bg-slate-950 text-white'
                  : 'text-white'
                : 'text-slate-500 group-hover:text-slate-200',
            )}
          >
            <Icon className={prominent ? 'h-[17px] w-[17px]' : 'h-4 w-4'} />
          </span>

          <span
            className={cx(
              'min-w-0 flex-1 truncate',
              prominent ? 'text-[13px] font-semibold' : 'text-[13px] font-medium',
            )}
          >
            {item.label}
          </span>

          {prominent && (
            <span
              className={cx(
                'h-1.5 w-1.5 rounded-full',
                isActive ? 'bg-brand-500' : 'bg-transparent',
              )}
            />
          )}
        </>
      )}
    </NavLink>
  )
}

function NavSection({ section, visibleItems, pathname, onNavigate }) {
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
        {visibleItems.map((item, index) => (
          <NavItem
            key={item.to}
            item={item}
            prominent={index === 1}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="border-t border-white/[0.06] pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="mb-1 flex h-7 w-full items-center gap-2 px-3 text-left"
        aria-expanded={open}
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {section.label}
        </span>

        <span className="ml-auto grid h-5 w-5 place-items-center rounded-md text-slate-600 transition hover:bg-white/[0.05] hover:text-slate-300">
          <ChevronDown
            className={cx('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')}
          />
        </span>
      </button>

      <div
        className={cx(
          'overflow-hidden transition-[max-height,opacity] duration-200',
          open ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="space-y-0.5">
          {visibleItems.map((item) => (
            <NavItem key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
    </div>
  )
}

function Sidebar({ onNavigate }) {
  const can = useAuthStore((state) => state.can)
  const { pathname } = useLocation()

  const sections = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        visibleItems: section.items.filter((item) => can(item.can)),
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
    <div className="min-h-screen bg-slate-50">
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
          'fixed inset-y-0 left-0 z-50 flex w-[258px] flex-col bg-[#111827] text-white',
          'border-r border-slate-800 shadow-xl transition-transform duration-200',
          'lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="flex h-[68px] shrink-0 items-center border-b border-white/[0.07] px-4">
          <NavLink
            to="/admin"
            onClick={closeMobile}
            className="flex min-w-0 items-center gap-3"
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-slate-950">
              <span className="text-sm font-black tracking-tight">U</span>
            </div>

            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold tracking-tight text-white">
                Upokoron
              </p>
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Admin Console
              </p>
            </div>
          </NavLink>

          <button
            type="button"
            onClick={closeMobile}
            className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-white lg:hidden"
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
        <div className="shrink-0 border-t border-white/[0.07] p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-700 text-[10px] font-bold text-slate-200">
              {initials(user?.name ?? '')}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-200">
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
              className="rounded-lg p-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[258px]">
        <header className="sticky top-0 z-30 flex h-[64px] items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-6">
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