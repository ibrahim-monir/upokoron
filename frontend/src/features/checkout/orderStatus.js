/**
 * How each order status is coloured.
 *
 * One map, shared by every screen that shows a status. Two copies drift, and
 * a "delivered" badge that is green on one page and grey on another makes
 * people doubt both.
 *
 * The tones are deliberately conservative: only a completed sale is green,
 * and only a parcel that came back is red. Everything in progress is brand
 * blue, because "confirmed" is not an achievement and should not read like
 * one.
 */
export const ORDER_STATUS_TONE = {
  pending: 'warning',
  confirmed: 'brand',
  packed: 'brand',
  shipped: 'brand',
  delivered: 'success',
  cancelled: 'neutral',
  returned: 'danger',
}

export function statusTone(status) {
  return ORDER_STATUS_TONE[status] ?? 'neutral'
}
