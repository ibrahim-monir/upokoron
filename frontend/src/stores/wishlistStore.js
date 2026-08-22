import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * What a shopper has saved for later.
 *
 * Only identity lives here -- the id, the slug used to fetch it, and when it
 * was saved. Price and stock are deliberately NOT stored: they go stale the
 * moment they are written, and a wishlist whose prices are months old is
 * worse than one that takes a moment to load. Those come from the API, the
 * same as everywhere else in this app.
 *
 * It is persisted to localStorage rather than the server because there is no
 * wishlist table yet. That means it is per-device and survives sign-out,
 * which is the honest behaviour for something the backend has never seen.
 * Moving it server-side later only changes this file.
 */
export const useWishlistStore = create(
  persist(
    (set, storeGet) => ({
      items: [],

      has(productId) {
        return storeGet().items.some((item) => item.id === productId)
      },

      /** Save it, or unsave it if it is already there. Returns the new state. */
      toggle(product) {
        if (!product?.id || !product?.slug) return false

        const { items } = storeGet()
        const existing = items.some((item) => item.id === product.id)

        set({
          items: existing
            ? items.filter((item) => item.id !== product.id)
            : [
                { id: product.id, slug: product.slug, addedAt: new Date().toISOString() },
                ...items,
              ],
        })

        return !existing
      },

      remove(productId) {
        set({ items: storeGet().items.filter((item) => item.id !== productId) })
      },

      clear() {
        set({ items: [] })
      },
    }),
    {
      name: 'upokoron.wishlist',
      // Only the saved list is worth persisting; the actions are rebuilt on
      // every load and writing them would just bloat the entry.
      partialize: (state) => ({ items: state.items }),
    },
  ),
)

/** Just the count, so the header badge does not re-render on unrelated changes. */
export function useWishlistCount() {
  return useWishlistStore((state) => state.items.length)
}
