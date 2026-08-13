import { create } from 'zustand'
import { get, post, put, resetCsrfCookie } from '../lib/api'

/*
 * Session identity only.
 *
 * Domain data (products, orders, reports) lives in TanStack Query and nowhere
 * else -- copying it into a store is the fastest way to ship a stale-cache
 * bug. The signed-in user is the exception: route guards need to read it
 * synchronously while deciding whether to render at all.
 *
 * There is no token here on purpose. Auth is an HttpOnly cookie the browser
 * holds and JavaScript cannot see.
 */
export const useAuthStore = create((set, getState) => ({
  user: null,
  permissions: [],
  roles: [],

  /** True until the first `bootstrap()` settles, so guards can wait. */
  loading: true,

  setUser(user) {
    set({
      user,
      permissions: user?.permissions ?? [],
      roles: user?.roles ?? [],
    })
  },

  /**
   * Ask the API who we are. A 401 is the normal answer for a visitor, not
   * an error worth surfacing.
   */
  async bootstrap() {
    try {
      const { data } = await get('/shop/auth/me')
      getState().setUser(data)
    } catch {
      getState().setUser(null)
    } finally {
      set({ loading: false })
    }
  },

  async login({ identifier, password, remember = false, admin = false }) {
    const endpoint = admin ? '/admin/auth/login' : '/shop/auth/login'
    const { user } = await post(endpoint, { identifier, password, remember })

    getState().setUser(user)

    return user
  },

  async register(payload) {
    const { user } = await post('/shop/auth/register', payload)

    getState().setUser(user)

    return user
  },

  async logout() {
    try {
      await post('/shop/auth/logout')
    } catch {
      // Already signed out server-side; clear locally regardless.
    }

    // The session cookie is gone, and the CSRF token that was tied to it
    // with it. Forcing a refetch avoids a 419 on the next write.
    resetCsrfCookie()
    getState().setUser(null)
  },

  async updateProfile(payload) {
    const { user } = await put('/shop/auth/profile', payload)
    getState().setUser(user)
    return user
  },

  /** Does the signed-in user hold this permission? */
  can(permission) {
    if (!permission) return true

    return getState().permissions.includes(permission)
  },

  canAny(permissions = []) {
    return permissions.some((permission) => getState().can(permission))
  },

  hasRole(role) {
    return getState().roles.includes(role)
  },

  get isAuthenticated() {
    return getState().user !== null
  },
}))

/** Reads outside React (route loaders, interceptors). */
export const auth = {
  can: (permission) => useAuthStore.getState().can(permission),
  user: () => useAuthStore.getState().user,
}
