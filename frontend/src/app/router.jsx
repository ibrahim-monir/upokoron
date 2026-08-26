import { lazy, Suspense } from 'react'
import { createBrowserRouter, Link, Navigate, useSearchParams } from 'react-router-dom'
import { StorefrontLayout } from '../layouts/StorefrontLayout'
import { AdminLayout } from '../layouts/AdminLayout'
import { RequireAdmin, RequireAuth, RequireGuest, RequirePermission } from './guards'
import { PageLoader } from '../components/ui'

function InventoryRedirect() {
  const [params] = useSearchParams()
  const filter = params.get('filter') ?? params.get('stock')
  const search = params.get('search')

  const next = new URLSearchParams()
  if (filter) next.set('stock', filter)
  if (search) next.set('search', search)

  const query = next.toString()

  return <Navigate to={`/admin/products${query ? `?${query}` : ''}`} replace />
}

// Storefront pages load eagerly; they are the first thing a visitor sees.
import { HomePage } from '../features/storefront/HomePage'
import { ProductListPage } from '../features/storefront/ProductListPage'
import { ProductDetailPage } from '../features/storefront/ProductDetailPage'
import { ContactPage, ContentPage } from '../features/storefront/ContentPage'
import { CartPage } from '../features/cart/CartPage'
import { WishlistPage } from '../features/wishlist/WishlistPage'
import { CheckoutPage } from '../features/checkout/CheckoutPage'
import { OrderCompletePage } from '../features/checkout/OrderCompletePage'
import { OrderDetailPage } from '../features/checkout/OrderDetailPage'
import { OrdersPage } from '../features/checkout/OrdersPage'
import { TrackOrderPage } from '../features/checkout/TrackOrderPage'
import { LoginPage } from '../features/auth/LoginPage'
import { RegisterPage } from '../features/auth/RegisterPage'
import { AccountPage } from '../features/auth/AccountPage'
import { AdminLoginPage } from '../features/auth/AdminLoginPage'
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage'

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
      <p className="text-sm font-semibold uppercase tracking-wider text-brand-800">404</p>
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
      { path: 'category/:slug', element: <ProductListPage /> },

      // Guests included: a shopper fills a basket, and buys, before deciding
      // whether to make an account. Requiring one to check out loses sales,
      // and the address they type is all the shop actually needs -- so these
      // are deliberately not behind RequireAuth.
      { path: 'cart', element: <CartPage /> },
      { path: 'wishlist', element: <WishlistPage /> },
      { path: 'checkout', element: <CheckoutPage /> },

      // A single order is public, because a guest who has just bought
      // something must see their confirmation rather than being thrown at a
      // login screen seconds after committing to pay. Without a session the
      // API also demands the delivery phone number, which the page carries in
      // the URL after checkout.
      { path: 'orders/:number', element: <OrderDetailPage /> },

      // The receipt shown right after checkout -- a different page from the
      // one above, because "your order is placed!" stops being true the
      // moment the order ships or is cancelled.
      { path: 'order-complete/:number', element: <OrderCompletePage /> },

      // Tracking is deliberately public. Most people chasing a parcel
      // bought as a guest, and the ones who did have an account are not
      // reaching for it while they wait for a courier.
      { path: 'track', element: <TrackOrderPage /> },

      // The LIST is different: "every order this person ever placed" needs an
      // account to scope it to.
      {
        path: 'orders',
        element: (
          <RequireAuth>
            <OrdersPage />
          </RequireAuth>
        ),
      },

      // Footer pages. Bodies come from settings the owner writes.
      { path: 'contact', element: <ContactPage /> },
      {
        path: 'about',
        element: <ContentPage title="About us" settingKey="page_about" />,
      },
      {
        path: 'privacy',
        element: <ContentPage title="Privacy policy" settingKey="page_privacy" />,
      },
      {
        path: 'terms',
        element: <ContentPage title="Terms & conditions" settingKey="page_terms" />,
      },

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
        path: 'forgot-password',
        element: (
          <RequireGuest>
            <ForgotPasswordPage />
          </RequireGuest>
        ),
      },
      {
        path: 'reset-password',
        element: (
          <RequireGuest>
            <ResetPasswordPage />
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
        element: guarded(
          // Stock lives on this page now, so the roles that only ever had
          // stock permissions still need in.
          ['products.view', 'inventory.view'],
          lazyAdmin(() => import('../features/admin/ProductsPage')),
        ),
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
        path: 'media',
        element: guarded('media.view', lazyAdmin(() => import('../features/admin/media/MediaLibrary'))),
      },

      {
        path: 'orders',
        element: guarded('orders.view', lazyAdmin(() => import('../features/admin/OrdersPage'))),
      },
      {
        path: 'orders/:id',
        element: guarded('orders.view', lazyAdmin(() => import('../features/admin/OrderDetailPage'))),
      },

      {
        path: 'shipping',
        element: guarded('shipping.manage', lazyAdmin(() => import('../features/admin/ShippingZonesPage'))),
      },
      {
        path: 'payment-methods',
        element: guarded('payments.manage', lazyAdmin(() => import('../features/admin/PaymentMethodsPage'))),
      },
      {
        path: 'coupons',
        element: guarded('coupons.manage', lazyAdmin(() => import('../features/admin/CouponsPage'))),
      },
      {
        path: 'faqs',
        element: guarded('faqs.manage', lazyAdmin(() => import('../features/admin/FaqPage'))),
      },
      {
        path: 'contact-messages',
        element: guarded(
          'contact.view',
          lazyAdmin(() => import('../features/admin/ContactMessagesPage')),
        ),
      },
      {
        path: 'reviews',
        element: guarded('reviews.view', lazyAdmin(() => import('../features/admin/ReviewsPage'))),
      },
      {
        path: 'rewards',
        element: guarded('rewards.view', lazyAdmin(() => import('../features/admin/RewardsPage'))),
      },

      /*
       * Stock is managed from the products table now, so this route only
       * exists to carry old links there: bookmarks, the dashboard tiles,
       * and anything a shop owner mailed themselves. The stock filter is
       * carried across under the name the products list uses for it, so
       * "show me what is out of stock" survives the move.
       */
      {
        path: 'inventory',
        element: <InventoryRedirect />,
      },

      {
        path: 'banners',
        element: guarded('banners.manage', lazyAdmin(() => import('../features/admin/BannersPage'))),
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
        // The same screen with its create form already open, so "Add new
        // user" can be a link in the menu rather than a second copy of the
        // form. Guarded on manage, not view: reaching this URL is an intent
        // to create one.
        path: 'users/new',
        element: guarded('users.manage', lazyAdmin(() => import('../features/admin/UsersPage'))),
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
