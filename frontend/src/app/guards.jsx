import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { PageLoader } from '../components/ui'

/**
 * Wait for `bootstrap()` before deciding anything.
 *
 * Without this, a guard runs while the session is still being established,
 * bounces a signed-in user to the login screen, and they watch the page they
 * asked for flash past on the way there.
 */
function useSession() {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)

  return { user, loading }
}

export function RequireAuth({ children, redirectTo = '/login' }) {
  const { user, loading } = useSession()
  const location = useLocation()

  if (loading) return <PageLoader label="Checking your session" />

  if (!user) {
    // Remember where they were headed so sign-in can finish the journey.
    return <Navigate to={redirectTo} replace state={{ from: location }} />
  }

  return children
}

export function RequireGuest({ children, redirectTo = '/' }) {
  const { user, loading } = useSession()

  if (loading) return <PageLoader />

  if (user) return <Navigate to={redirectTo} replace />

  return children
}

/**
 * Admin panel gate. `admin.access` is the same permission the API middleware
 * checks, so the two cannot disagree about who may open the back office.
 */
export function RequireAdmin({ children }) {
  const { user, loading } = useSession()
  const can = useAuthStore((state) => state.can)
  const location = useLocation()

  if (loading) return <PageLoader label="Checking your session" />

  if (!user) return <Navigate to="/admin/login" replace state={{ from: location }} />

  if (!can('admin.access')) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="text-lg font-semibold text-ink-900">No admin access</h1>
        <p className="mt-2 text-sm text-ink-600">
          This account cannot open the admin panel. Ask the owner to grant it if that is wrong.
        </p>
      </div>
    )
  }

  return children
}

/**
 * Per-page permission gate. The API enforces the same permission again on
 * every request -- this only decides whether to bother rendering.
 */
export function RequirePermission({ permission, children }) {
  const can = useAuthStore((state) => state.can)

  if (!can(permission)) {
    return (
      <div className="rounded-card border border-ink-200 bg-white p-10 text-center">
        <h1 className="text-lg font-semibold text-ink-900">Not allowed</h1>
        <p className="mt-2 text-sm text-ink-600">
          You do not have the <code className="rounded bg-ink-100 px-1">{permission}</code> permission.
        </p>
      </div>
    )
  }

  return children
}
