import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import {
  BookOpen,
  Boxes,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  ScrollText,
  Settings,
  Shapes,
  ShieldCheck,
  Store,
  Truck,
  Users,
  X,
} from 'lucide-react'
import { cx, initials } from '../lib/format'
import { useAuthStore } from '../stores/authStore'

/*
 * Every item declares the permission it needs. The sidebar then shows only
 * what this account can actually reach -- a menu full of links that 403 is
 * worse than no menu. The API checks the same permission again on every
 * request, because a hidden link is not access control.
 */
const SECTIONS = [
  {
    label: null,
    items: [{ to: '/admin', end: true, icon: LayoutDashboard, label: 'Dashboard', can: 'dashboard.view' }],
  },
  {
    label: 'Catalogue',
    items: [
      { to: '/admin/products', icon: Package, label: 'Products', can: 'products.view' },
      { to: '/admin/categories', icon: Shapes, label: 'Categories', can: 'products.view' },
      { to: '/admin/brands', icon: Store, label: 'Brands', can: 'products.view' },
      { to: '/admin/attributes', icon: Shapes, label: 'Attributes', can: 'products.view' },
      { to: '/admin/media', icon: ImageIcon, label: 'Image library', can: 'media.view' },
    ],
  },
  {
    // Above Stock deliberately: this is the screen the shop opens first every
    // morning, and the one it lives in all day.
    label: 'Sales',
    items: [
      { to: '/admin/orders', icon: ReceiptText, label: 'Orders', can: 'orders.view' },
      { to: '/admin/shipping', icon: Truck, label: 'Delivery zones', can: 'shipping.manage' },
    ],
  },
  {
    label: 'Stock',
    items: [{ to: '/admin/inventory', icon: Boxes, label: 'Inventory', can: 'inventory.view' }],
  },
  {
    label: 'Money',
    items: [
      { to: '/admin/accounts', icon: BookOpen, label: 'Chart of accounts', can: 'accounting.view' },
      { to: '/admin/journal', icon: ScrollText, label: 'Journal', can: 'accounting.view' },
      { to: '/admin/reports/trial-balance', icon: FileText, label: 'Trial balance', can: 'accounting.view' },
      { to: '/admin/reports/profit-loss', icon: FileText, label: 'Profit & loss', can: 'accounting.view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/users', icon: Users, label: 'Users', can: 'users.view' },
      { to: '/admin/roles', icon: ShieldCheck, label: 'Roles', can: 'roles.manage' },
      { to: '/admin/settings', icon: Settings, label: 'Settings', can: 'settings.manage' },
      { to: '/admin/audit-logs', icon: ScrollText, label: 'Audit log', can: 'audit.view' },
    ],
  },
]

function SidebarNav({ onNavigate }) {
  const can = useAuthStore((state) => state.can)

  return (
    <nav className="flex flex-col gap-6 p-3">
      {SECTIONS.map((section, index) => {
        const visible = section.items.filter((item) => can(item.can))

        if (visible.length === 0) return null

        return (
          <div key={section.label ?? index} className="flex flex-col gap-1">
            {section.label && (
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-400">
                {section.label}
              </p>
            )}

            {visible.map(({ to, end, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-brand-600 font-medium text-white'
                      : 'text-ink-300 hover:bg-ink-800 hover:text-white',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </div>
        )
      })}
    </nav>
  )
}

export function AdminLayout() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-ink-50">
      {/* Backdrop, mobile only. */}
      {open && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-ink-950/50 lg:hidden"
        />
      )}

      <aside
        className={cx(
          'fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto bg-ink-900 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-ink-800 px-4">
          <NavLink to="/admin" className="flex items-center gap-2 text-white">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="font-semibold">Upokoron</span>
          </NavLink>

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
            className="rounded p-1 text-ink-400 hover:text-white lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <SidebarNav onNavigate={() => setOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200 bg-white px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <NavLink to="/" className="text-sm text-ink-500 hover:text-ink-900">
            View shop →
          </NavLink>

          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-100"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                {initials(user?.name ?? '')}
              </span>
              <span className="hidden text-sm font-medium text-ink-800 sm:block">{user?.name}</span>
              <ChevronDown className="h-4 w-4 text-ink-400" aria-hidden="true" />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1 w-56 overflow-hidden rounded-lg border border-ink-200 bg-white shadow-raised"
              >
                <div className="border-b border-ink-100 px-3 py-2">
                  <p className="truncate text-sm font-medium text-ink-900">{user?.name}</p>
                  <p className="truncate text-xs text-ink-500">{user?.email ?? user?.phone}</p>
                  {user?.roles?.length > 0 && (
                    <p className="mt-1 text-xs text-brand-700">{user.roles.join(', ')}</p>
                  )}
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    await logout()
                    navigate('/admin/login')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
