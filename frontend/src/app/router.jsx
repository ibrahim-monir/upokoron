import { lazy, Suspense } from 'react'
import { createBrowserRouter, Link } from 'react-router-dom'
import { StorefrontLayout } from '../layouts/StorefrontLayout'
import { AdminLayout } from '../layouts/AdminLayout'
import { RequireAdmin, RequireAuth, RequireGuest, RequirePermission } from './guards'
import { PageLoader } from '../components/ui'

// Storefront pages load eagerly; they are the first thing a visitor sees.
import { HomePage } from '../features/storefront/HomePage'
import { ProductListPage } from '../features/storefront/ProductListPage'
import { ProductDetailPage } from '../features/storefront/ProductDetailPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { AccountPage } from '../features/auth/AccountPage'
import { AdminLoginPage } from '../features/auth/AdminLoginPage'

/*
 * The whole admin panel is lazy. A customer browsing the shop should never
 * download the back office, and it is by far the larger half of the app.
 */
const lazyAdmin = (loader) => {
  const Component = lazy(loader)

  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  )
}

const guarded = (permission, element) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
)

function NotFound() {
  return (
    <div className="py-20 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-ink-900">Page not found</h1>
      <p className="mt-2 text-ink-600">That page does not exist, or it moved.</p>
      <Link
        to="/"
        className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
      >
        Back to the shop
      </Link>
    </div>
  )
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <StorefrontLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'products', element: <ProductListPage /> },
      { path: 'products/:slug', element: <ProductDetailPage /> },

      {
        path: 'login',
        element: (
          <RequireGuest>
            <LoginPage />
          </RequireGuest>
        ),
      },
      {
        path: 'register',
        element: (
          <RequireGuest>
            <RegisterPage />
          </RequireGuest>
        ),
      },
      {
        path: 'account',
        element: (
          <RequireAuth>
            <AccountPage />
          </RequireAuth>
        ),
      },

      { path: '*', element: <NotFound /> },
    ],
  },

  // Sits outside AdminLayout: signing in should not render the chrome of a
  // panel you cannot open yet.
  { path: '/admin/login', element: <AdminLoginPage /> },

  {
    path: '/admin',
    element: (
      <RequireAdmin>
        <AdminLayout />
      </RequireAdmin>
    ),
    children: [
      { index: true, element: lazyAdmin(() => import('../features/admin/DashboardPage')) },

      {
        path: 'products',
        element: guarded('products.view', lazyAdmin(() => import('../features/admin/ProductsPage'))),
      },
      {
        path: 'products/new',
        element: guarded('products.create', lazyAdmin(() => import('../features/admin/ProductFormPage'))),
      },
      {
        path: 'products/:id/edit',
        element: guarded('products.update', lazyAdmin(() => import('../features/admin/ProductFormPage'))),
      },
      {
        path: 'categories',
        element: guarded('products.view', lazyAdmin(() => import('../features/admin/CategoriesPage'))),
      },
      {
        path: 'brands',
        element: guarded('products.view', lazyAdmin(() => import('../features/admin/BrandsPage'))),
      },
      {
        path: 'attributes',
        element: guarded('products.view', lazyAdmin(() => import('../features/admin/AttributesPage'))),
      },

      {
        path: 'inventory',
        element: guarded('inventory.view', lazyAdmin(() => import('../features/admin/InventoryPage'))),
      },

      {
        path: 'accounts',
        element: guarded('accounting.view', lazyAdmin(() => import('../features/admin/AccountsPage'))),
      },
      {
        path: 'journal',
        element: guarded('accounting.view', lazyAdmin(() => import('../features/admin/JournalPage'))),
      },
      {
        path: 'reports/trial-balance',
        element: guarded('accounting.view', lazyAdmin(() => import('../features/admin/TrialBalancePage'))),
      },
      {
        path: 'reports/profit-loss',
        element: guarded('accounting.view', lazyAdmin(() => import('../features/admin/ProfitLossPage'))),
      },

      {
        path: 'users',
        element: guarded('users.view', lazyAdmin(() => import('../features/admin/UsersPage'))),
      },
      {
        path: 'roles',
        element: guarded('roles.manage', lazyAdmin(() => import('../features/admin/RolesPage'))),
      },
      {
        path: 'settings',
        element: guarded('settings.manage', lazyAdmin(() => import('../features/admin/SettingsPage'))),
      },
      {
        path: 'audit-logs',
        element: guarded('audit.view', lazyAdmin(() => import('../features/admin/AuditLogPage'))),
      },

      { path: '*', element: <NotFound /> },
    ],
  },
])
