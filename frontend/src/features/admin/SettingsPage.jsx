import { useEffect, useState } from 'react'
import { Image as ImageIcon } from 'lucide-react'
import { useList, useWrite } from './useResource'
import { useAuthStore } from '../../stores/authStore'
import { AuditLog } from './AuditLogPage'
import { useThemePreview } from '../../lib/useTheme'
import { parseHex } from '../../lib/theme'
import { MediaPicker } from './media/MediaLibrary'
import { Button, Card, ErrorState, Field, Select, Spinner, Textarea } from '../../components/ui'
import { cx } from '../../lib/format'

/*
 * Only keys the backend declares in config can be written, so this screen is
 * driven by whatever `GET /admin/settings` returns rather than a hardcoded
 * list that would drift from it.
 */
const GROUP_LABELS = {
  store: 'Store details',
  pages: 'Footer pages',
  sales: 'Sales and orders',
  inventory: 'Inventory',
  theme: 'Brand colours',
  home: 'Home page',
  product: 'Product page',
  marketing: 'Analytics & search console',
  audit: 'Audit log',
}

/*
 * The audit log is a tab here, not a settings group. It reads a different
 * endpoint and writes nothing, so it sits beside the groups rather than
 * inside the form -- its own filter and pager have no business being
 * submitted with the settings.
 */
const AUDIT_TAB = 'audit'

/*
 * Four colours, and everything else is derived from them (see lib/theme.js).
 * The hints matter here: an owner picking "the dark one" needs to know it is
 * about to become the header, the footer, and the whole admin panel.
 */
const COLOUR_HINTS = {
  theme_primary: 'Buttons, links, active state, prices.',
  theme_primary_dark: 'The pressed and hover shade of the primary.',
  theme_background: 'The page behind the content.',
  theme_dark: 'Header, footer, and the admin panel.',
}

/** Long-form settings that need room to write in. */
const MULTILINE = [
  'about_intro',
  'about_intro_bangla',
  'about_notice',
  'about_notice_bangla',
  'page_privacy',
  'page_terms',
  'store_address',
  'store_description',
  'store_ticker_text',
  'custom_header_scripts',
  'custom_footer_scripts',
]

/** Settings edited as code rather than prose -- monospace, so tags and brackets are easy to read. */
const CODE_KEYS = ['custom_header_scripts', 'custom_footer_scripts']

/** Plain-text settings whose expected format is not obvious from the label alone. */
const HINTS = {
  about_intro: 'The About page body, in English. Blank lines separate paragraphs.',
  about_intro_bangla: 'The same story in Bangla. Readers switch between the two on the page itself.',
  about_notice:
    'The ownership notice, in English. It sits in a highlighted panel near the top of the About page, and both languages of it are always shown -- whichever one the reader is not on appears underneath. Emptying both hides the panel, which is the statement not being made.',
  about_notice_bangla: 'The ownership notice in Bangla.',
  google_site_verification:
    "From Search Console: Settings > Ownership verification > HTML tag. Paste only the tag's content value, not the whole <meta> tag.",
  google_analytics_id: 'The GA4 Measurement ID from Admin > Data streams, in the form G-XXXXXXXXXX.',
  custom_header_scripts:
    'Anything not covered above -- a Facebook Pixel, a chat widget, a verification snippet. Paste the script tag(s) as given; runs on every storefront page, at the end of <head>.',
  custom_footer_scripts:
    'Same as header scripts, but placed at the end of the page instead -- for anything documented to go right before </body>.',
  store_ticker_text:
    'One message per line, scrolling in the header top bar. Leave blank to show nothing there.',
  product_pairs_title:
    'Heading above the accessories picked for a product, shown in the sidebar beside its gallery and price.',
}

/** Settings that hold an image URL, so they get a picker instead of a text box. */
const IMAGE_KEYS = ['store_logo', 'store_favicon']

const CHOICES = {
  store_header_style: [
    { value: 'categories', label: 'Categories — top bar, search, category mega menu' },
    { value: 'classic', label: 'Classic — logo, search, Shop/Offers/Contact' },
  ],
  revenue_recognition_point: [
    { value: 'delivered', label: 'On delivery (recommended for COD)' },
    { value: 'shipped', label: 'On shipment' },
  ],
  home_trending_days: [
    { value: '7', label: 'Last 7 days' },
    { value: '30', label: 'Last 30 days' },
    { value: '90', label: 'Last 90 days' },
  ],
  home_categories_style: [
    { value: 'circle', label: 'Circle — round image, name underneath' },
    { value: 'card', label: 'Card — image over a labelled panel' },
    { value: 'tile', label: 'Tile — compact row, no image needed' },
  ],
}

function humanise(key) {
  return key.replace(/_/g, ' ').replace(/^./, (char) => char.toUpperCase())
}

export default function SettingsPage() {
  const query = useList('admin.settings', '/admin/settings')
  const write = useWrite('admin.settings', { successMessage: 'Settings saved.' })
  const [values, setValues] = useState({})

  // Which image setting the picker is currently choosing for, if any.
  const [picking, setPicking] = useState(null)

  // Which group's tab is showing. Falls back to the first real group below,
  // once the list of groups is known -- config declares 'store' first, but
  // nothing guarantees that stays true forever.
  const [activeGroup, setActiveGroup] = useState('store')
  const can = useAuthStore((state) => state.can)

  // Repaint the panel from the unsaved draft, and put the saved colours
  // back if this screen is left without saving.
  useThemePreview(values, query.data?.data)

  useEffect(() => {
    if (query.data?.data) setValues(query.data.data)
  }, [query.data])

  if (query.isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Spinner />
      </div>
    )
  }

  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />

  // Reward points get their own dedicated screen (Admin > Rewards). Affiliate
  // and tax have no wired-up feature behind them yet, so both are hidden here.
  const groups = (query.data?.groups ?? []).filter(
    (group) => group !== 'rewards' && group !== 'affiliate' && group !== 'tax',
  )

  const submit = (event) => {
    event.preventDefault()
    write.mutate({ method: 'put', url: '/admin/settings', body: { settings: values } })
  }

  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }))

  // The API returns a flat map, so group membership comes from the config
  // group list plus a prefix convention.
  const keysFor = (group) =>
    Object.keys(values).filter((key) => {
      if (group === 'store') return key.startsWith('store_')
      if (group === 'pages') return key.startsWith('page_')
      if (group === 'theme') return key.startsWith('theme_')
      if (group === 'home') return key.startsWith('home_')
      if (group === 'product') return key.startsWith('product_')
      if (group === 'marketing') return key.startsWith('google_') || key.startsWith('custom_')
      if (group === 'inventory') return key === 'allow_negative_stock' || key === 'low_stock_alert'
      return (
        key.startsWith('revenue_') ||
        key.startsWith('reservation_') ||
        key.startsWith('return_window') ||
        key === 'allow_guest_checkout' ||
        key === 'min_order_amount'
      )
    })

  // Only groups with something to show get a tab -- a group whose keys were
  // all filtered out above (or never had any) would otherwise be a tab that
  // opens onto an empty panel.
  const visibleGroups = groups.filter((group) => keysFor(group).length > 0)

  const tabs = can('audit.view') ? [...visibleGroups, AUDIT_TAB] : visibleGroups
  const currentGroup = tabs.includes(activeGroup) ? activeGroup : tabs[0]
  const showingAudit = currentGroup === AUDIT_TAB
  const keys = showingAudit ? [] : keysFor(currentGroup ?? '')

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <MediaPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        onSelect={(item) => set(picking, item.url)}
        folder="branding"
        title="Choose an image"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Settings</h1>
          <p className="mt-0.5 text-sm text-ink-500">
            These change how the business behaves, not just how it looks.
          </p>
        </div>

        {/* Nothing to save on the audit tab; it only reads. */}
        {!showingAudit && (
          <Button type="submit" loading={write.isPending}>
            Save changes
          </Button>
        )}
      </div>

      <Card>
        <div className="flex gap-1 overflow-x-auto border-b border-ink-200 px-2" role="tablist">
          {tabs.map((group) => (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={group === currentGroup}
              onClick={() => setActiveGroup(group)}
              className={cx(
                'shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                group === currentGroup
                  ? 'border-brand-600 text-brand-800'
                  : 'border-transparent text-ink-500 hover:text-ink-800',
              )}
            >
              {GROUP_LABELS[group] ?? humanise(group)}
            </button>
          ))}
        </div>

        {showingAudit && (
          <div className="p-4">
            <AuditLog />
          </div>
        )}

        <div className={cx('gap-4 p-4 sm:grid-cols-2', showingAudit ? 'hidden' : 'grid')}>
          {keys.map((key) => {
            const value = values[key]

            /*
             * A swatch next to a hex box, both editing the same value:
             * the picker is how you explore, the text box is how you
             * paste the hex a designer sent you. Changes repaint the
             * whole panel immediately, so this screen is its own preview.
             */
            if (key.startsWith('theme_')) {
              const valid = parseHex(value) !== null

              return (
                <Field key={key} label={humanise(key)} hint={COLOUR_HINTS[key]}>
                  {({ id }) => (
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        aria-label={`${humanise(key)} colour picker`}
                        value={valid ? value : '#000000'}
                        onChange={(event) => set(key, event.target.value.toUpperCase())}
                        className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-ink-200 bg-white p-1"
                      />

                      <input
                        id={id}
                        value={value ?? ''}
                        onChange={(event) => set(key, event.target.value.toUpperCase())}
                        spellCheck={false}
                        className={cx(
                          'h-10 w-full rounded-lg border px-3 font-mono text-sm uppercase',
                          valid ? 'border-ink-200' : 'border-danger-500 text-danger-700',
                        )}
                      />
                    </div>
                  )}
                </Field>
              )
            }

            if (typeof value === 'boolean') {
              return (
                <label key={key} className="flex items-center gap-2 self-end pb-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(event) => set(key, event.target.checked)}
                    className="h-4 w-4 rounded border-ink-300"
                  />
                  {humanise(key)}
                </label>
              )
            }

            if (CHOICES[key]) {
              return (
                <Field key={key} label={humanise(key)}>
                  {({ id }) => (
                    <Select id={id} value={value ?? ''} onChange={(event) => set(key, event.target.value)}>
                      {CHOICES[key].map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )
            }

            // Image settings get a picker and a live preview rather than
            // a text box the owner has to paste a URL into.
            if (IMAGE_KEYS.includes(key)) {
              return (
                <Field key={key} label={humanise(key)} hint="Pick from the image library.">
                  {() => (
                    <div className="flex items-center gap-3">
                      <span className="grid h-14 w-28 shrink-0 place-items-center overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
                        {value ? (
                          <img src={value} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-ink-400" aria-hidden="true" />
                        )}
                      </span>

                      <Button variant="secondary" size="sm" onClick={() => setPicking(key)}>
                        {value ? 'Change' : 'Choose'}
                      </Button>

                      {value && (
                        <Button variant="ghost" size="sm" onClick={() => set(key, '')}>
                          Remove
                        </Button>
                      )}
                    </div>
                  )}
                </Field>
              )
            }

            if (MULTILINE.includes(key)) {
              return (
                <Field
                  key={key}
                  label={humanise(key)}
                  className="sm:col-span-2"
                  hint={
                    HINTS[key] ??
                    (key.startsWith('page_')
                      ? 'Shown on the storefront. Left blank, the page says it has not been written yet.'
                      : undefined)
                  }
                >
                  {({ id }) => (
                    <Textarea
                      id={id}
                      rows={key.startsWith('page_') ? 8 : CODE_KEYS.includes(key) ? 6 : 3}
                      value={value ?? ''}
                      onChange={(event) => set(key, event.target.value)}
                      className={CODE_KEYS.includes(key) ? 'font-mono text-xs' : undefined}
                      spellCheck={CODE_KEYS.includes(key) ? false : undefined}
                    />
                  )}
                </Field>
              )
            }

            return (
              <Field
                key={key}
                label={humanise(key)}
                hint={HINTS[key]}
                type={typeof value === 'number' ? 'number' : 'text'}
                value={value ?? ''}
                onChange={(event) =>
                  set(key, typeof value === 'number' ? Number(event.target.value) : event.target.value)
                }
              />
            )
          })}
        </div>
      </Card>
    </form>
  )
}
