import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/*
 * The storefront's display language. Bangla by default -- this shop's
 * customers read Bangla first -- with English one click away in the
 * header. Persisted per device, the same way the wishlist is: there is no
 * account-level preference to hang it on.
 */
export const useLocaleStore = create(
  persist(
    (set, storeGet) => ({
      locale: 'bn',

      toggle() {
        set({ locale: storeGet().locale === 'bn' ? 'en' : 'bn' })
      },

      setLocale(locale) {
        set({ locale })
      },
    }),
    { name: 'upokoron.locale' },
  ),
)
