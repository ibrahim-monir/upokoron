import { create } from 'zustand'

/**
 * Whether the side cart is showing.
 *
 * A store rather than layout state because the things that open it are
 * scattered: the header button, the floating tab, and every Add to cart
 * on the site. Threading a callback down to all of them would mean every
 * product card knowing the layout exists.
 *
 * Only the open flag lives here. The basket itself stays server state in
 * TanStack Query -- see useCart for why a second copy of it is a bug.
 */
export const useCartDrawer = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
}))
