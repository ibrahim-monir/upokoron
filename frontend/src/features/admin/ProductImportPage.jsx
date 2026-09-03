import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Download, FileSpreadsheet, Link2, Upload } from 'lucide-react'
import { post } from '../../lib/api'
import { useList } from './useResource'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Select,
  TableWrap,
  Td,
  Th,
  useToast,
} from '../../components/ui'

/**
 * Getting products in from somewhere else.
 *
 * Both halves of this page end in the same place on purpose: a DRAFT that a
 * person then opens in the normal product form. Nothing imported reaches the
 * storefront without someone having looked at it, because the two things
 * being imported -- a price, and somebody else's product copy -- are exactly
 * the two things you do not want appearing unread in your own shop.
 */
export default function ProductImportPage() {
  const [tab, setTab] = useState('url')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-400">
          <span>Catalogue</span>
          <span>/</span>
          <span className="text-slate-600">Import products</span>
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-950">Import products</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Read one product page, or a whole supplier price list. Everything arrives as a draft for
          you to check — prices move, and product photos and descriptions usually belong to whoever
          published them, so rewrite anything you did not write yourself before going live.
        </p>
      </div>

      <div className="flex gap-1 rounded-xl bg-ink-100 p-1">
        {[
          { id: 'url', label: 'From a product page', icon: Link2 },
          { id: 'csv', label: 'From a CSV price list', icon: FileSpreadsheet },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={
              'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ' +
              (tab === id ? 'bg-white text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-800')
            }
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'url' ? <ImportFromUrl /> : <ImportFromCsv />}
    </div>
  )
}

/* -------------------------------------------------------------------------
   One product page
   ------------------------------------------------------------------------- */

function ImportFromUrl() {
  const navigate = useNavigate()
  const toast = useToast()

  const [url, setUrl] = useState('')
  const [draft, setDraft] = useState(null)
  const [categoryId, setCategoryId] = useState('')
  const [brandId, setBrandId] = useState('')
  const [keep, setKeep] = useState([])

  const categories = useList('admin.categories', '/admin/categories', { per_page: 200 })
  const brands = useList('admin.brands', '/admin/brands', { per_page: 200 })

  const categoryList = categories.data?.data ?? []
  const brandList = brands.data?.data ?? []

  const read = useMutation({
    mutationFn: (address) => post('/admin/products/import/scrape', { url: address }),
    onSuccess({ product, message }) {
      setDraft(product)
      setKeep(product.images ?? [])

      // The shop's own brand list is the authority; the page only suggested
      // a name, and creating a brand behind the admin's back is not this
      // screen's job.
      const match = brandList.find(
        (brand) => brand.name.toLowerCase() === (product.brand ?? '').toLowerCase(),
      )

      setBrandId(match ? String(match.id) : '')
      toast.success(message)
    },
    onError: (error) => toast.error(error?.message ?? 'Could not read that page.'),
  })

  const create = useMutation({
    mutationFn: async () => {
      const { product } = await post('/admin/products', {
        name: draft.name,
        category_id: Number(categoryId),
        brand_id: brandId ? Number(brandId) : null,
        type: 'simple',
        status: 'draft',
        sku: draft.sku || null,
        selling_price: draft.selling_price ?? '0',
        compare_at_price: draft.compare_at_price ?? null,
        short_description: draft.short_description || null,
        description: draft.description || null,
        additional_info: draft.additional_info ?? [],
        canonical_url: null,
      })

      // One at a time, and never fatally: each is a download from someone
      // else's server, and a photo that will not come is not a reason to
      // throw away a product that already saved.
      let imported = 0

      for (const image of keep) {
        try {
          await post(`/admin/products/${product.id}/images`, { source_url: image, alt: draft.name })
          imported++
        } catch {
          // Reported in the summary below, not as six separate toasts.
        }
      }

      return { product, imported, attempted: keep.length }
    },
    onSuccess({ product, imported, attempted }) {
      toast.success(
        `Draft created${attempted > 0 ? `, ${imported} of ${attempted} picture(s) copied` : ''}. Check every field before publishing.`,
      )
      navigate(`/admin/products/${product.id}/edit`)
    },
    onError: (error) => toast.error(error?.message ?? 'Could not create the draft.'),
  })

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Product page address"
          description="Works with any shop that publishes standard product data — most WooCommerce and Shopify stores do. Paste the page for a single product, not a category listing."
        />

        <form
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            if (url.trim()) read.mutate(url.trim())
          }}
        >
          <Field label="URL" className="flex-1">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="url"
                inputMode="url"
                placeholder="https://example.com/product/1n4007-diode"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="w-full"
              />
            )}
          </Field>

          <Button type="submit" loading={read.isPending} className="h-10 shrink-0">
            <Link2 className="h-4 w-4" aria-hidden="true" />
            Read page
          </Button>
        </form>
      </Card>

      {draft && (
        <Card>
          <CardHeader
            title={draft.name}
            description={draft.source ? `Read from ${draft.source}` : undefined}
            actions={
              draft.source_url ? (
                <a
                  href={draft.source_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm font-medium text-brand-800 hover:underline"
                >
                  Open the original
                </a>
              ) : null
            }
          />

          <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.2fr]">
            <div className="flex flex-col gap-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Detail label="Price">
                  {draft.selling_price ? `৳${draft.selling_price}` : <Missing />}
                </Detail>
                <Detail label="Was">
                  {draft.compare_at_price ? `৳${draft.compare_at_price}` : <Missing />}
                </Detail>
                <Detail label="SKU">{draft.sku || <Missing />}</Detail>
                <Detail label="Brand on the page">{draft.brand || <Missing />}</Detail>
                <Detail label="Availability">{draft.availability || <Missing />}</Detail>
                <Detail label="Specifications">
                  {draft.additional_info?.length ? `${draft.additional_info.length} row(s)` : <Missing />}
                </Detail>
              </dl>

              {draft.short_description && (
                <p className="rounded-lg bg-ink-50 p-3 text-sm text-ink-700">{draft.short_description}</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Category" required hint="Required — the page cannot tell us this.">
                  {({ id }) => (
                    <Select id={id} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                      <option value="">Choose one…</option>
                      {categoryList.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label="Brand">
                  {({ id }) => (
                    <Select id={id} value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                      <option value="">No brand</option>
                      {brandList.map((brand) => (
                        <option key={brand.id} value={brand.id}>
                          {brand.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-ink-800">
                Pictures{' '}
                <span className="font-normal text-ink-500">
                  — copied into your image library, not linked. Untick anything that is not yours to use.
                </span>
              </p>

              {(draft.images ?? []).length === 0 ? (
                <p className="rounded-lg border border-dashed border-ink-300 p-4 text-sm text-ink-500">
                  No pictures found. Upload your own on the next screen.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {draft.images.map((image) => {
                    const chosen = keep.includes(image)

                    return (
                      <button
                        key={image}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() =>
                          setKeep((current) =>
                            current.includes(image)
                              ? current.filter((item) => item !== image)
                              : [...current, image],
                          )
                        }
                        className={
                          'group relative aspect-square overflow-hidden rounded-lg border-2 bg-white ' +
                          (chosen ? 'border-brand-600' : 'border-ink-200 opacity-50')
                        }
                      >
                        <img src={image} alt="" className="h-full w-full object-contain" />
                        {chosen && (
                          <span className="absolute right-1 top-1">
                            <Badge tone="success">Keep</Badge>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-200 p-4">
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!categoryId}>
              Create draft product
            </Button>

            <Button variant="secondary" onClick={() => setDraft(null)}>
              Discard
            </Button>

            <p className="text-xs text-ink-500">
              Saved as a draft. Nothing appears in the shop until you publish it.
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}

function Detail({ label, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="text-ink-900">{children}</dd>
    </div>
  )
}

function Missing() {
  return <span className="text-ink-400">Not found</span>
}

/* -------------------------------------------------------------------------
   A supplier price list
   ------------------------------------------------------------------------- */

function ImportFromCsv() {
  const toast = useToast()
  const fileRef = useRef(null)

  const [options, setOptions] = useState({
    dry_run: true,
    create_missing: false,
    update_existing: true,
    default_status: 'draft',
    default_category_id: '',
  })

  const [summary, setSummary] = useState(null)

  const categories = useList('admin.categories', '/admin/categories', { per_page: 200 })
  const categoryList = categories.data?.data ?? []

  const upload = useMutation({
    mutationFn: (dryRun) => {
      const file = fileRef.current?.files?.[0]

      if (!file) throw new Error('Choose a file first.')

      const body = new FormData()

      body.append('file', file)
      body.append('dry_run', dryRun ? '1' : '0')
      body.append('create_missing', options.create_missing ? '1' : '0')
      body.append('update_existing', options.update_existing ? '1' : '0')
      body.append('default_status', options.default_status)

      if (options.default_category_id) body.append('default_category_id', options.default_category_id)

      return post('/admin/products/import/csv', body)
    },
    onSuccess(data) {
      setSummary(data.summary)
      toast.success(data.message)
    },
    onError: (error) => toast.error(error?.message ?? 'Could not read that file.'),
  })

  const set = (key) => (event) =>
    setOptions((current) => ({
      ...current,
      [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value,
    }))

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Supplier price list"
          description="A .csv saved from Excel or Google Sheets. Column headings are matched by meaning, so “Price”, “Rate” and “Selling price” are all understood. Existing products are matched on SKU."
          actions={
            <a
              href="/api/v1/admin/products/import/template"
              className="flex items-center gap-1.5 text-sm font-medium text-brand-800 hover:underline"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Template
            </a>
          }
        />

        <div className="grid gap-4 p-4">
          <Field label="File" hint="Up to 8 MB. One product per row, headings in the first row.">
            {({ id }) => (
              <input
                ref={fileRef}
                id={id}
                type="file"
                accept=".csv,.tsv,.txt,text/csv,text/plain"
                className="text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink-800"
              />
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category for rows with no category">
              {({ id }) => (
                <Select id={id} value={options.default_category_id} onChange={set('default_category_id')}>
                  <option value="">None — those rows fail</option>
                  {categoryList.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label="New products arrive as">
              {({ id }) => (
                <Select id={id} value={options.default_status} onChange={set('default_status')}>
                  <option value="draft">Draft — nobody sees them yet</option>
                  <option value="active">Active — live in the shop immediately</option>
                </Select>
              )}
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            <Toggle
              checked={options.update_existing}
              onChange={set('update_existing')}
              label="Update products whose SKU is already here"
              hint="Only the columns the file actually carries are touched."
            />
            <Toggle
              checked={options.create_missing}
              onChange={set('create_missing')}
              label="Create categories and brands the file mentions"
              hint="Off by default: a typo in the file otherwise becomes a category."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => upload.mutate(true)} loading={upload.isPending}>
              Preview only
            </Button>

            <Button onClick={() => upload.mutate(false)} loading={upload.isPending}>
              <Upload className="h-4 w-4" aria-hidden="true" />
              Import for real
            </Button>
          </div>
        </div>
      </Card>

      {categories.isError && <ErrorState error={categories.error} onRetry={categories.refetch} />}

      {summary && <CsvSummary summary={summary} />}
    </div>
  )
}

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-ink-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 rounded border-ink-300 text-brand-600"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-ink-500">{hint}</span>}
      </span>
    </label>
  )
}

const OUTCOME_TONES = { created: 'success', updated: 'brand', skipped: 'neutral', failed: 'danger' }

function CsvSummary({ summary }) {
  return (
    <Card>
      <CardHeader
        title={summary.dry_run ? 'Preview — nothing was saved' : 'Import finished'}
        description={
          summary.images_queued > 0
            ? `${summary.images_queued} picture(s) queued. They appear once the queue worker has run them.`
            : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        {[
          ['Rows read', summary.rows],
          [summary.dry_run ? 'Would create' : 'Created', summary.created],
          [summary.dry_run ? 'Would update' : 'Updated', summary.updated],
          ['Could not be read', summary.failed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-ink-50 p-3">
            <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
            <p className="text-xl font-bold text-ink-900">{value}</p>
          </div>
        ))}
      </div>

      {summary.results?.length > 0 && (
        <TableWrap>
          <thead>
            <tr>
              <Th numeric>Row</Th>
              <Th>Outcome</Th>
              <Th>Product</Th>
              <Th>SKU</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {summary.results.map((row) => (
              <tr key={`${row.row}-${row.sku ?? ''}`} className="hover:bg-ink-50">
                <Td numeric>{row.row}</Td>
                <Td>
                  <Badge tone={OUTCOME_TONES[row.action] ?? 'neutral'}>{row.action}</Badge>
                </Td>
                <Td>{row.name ?? '—'}</Td>
                <Td>{row.sku ?? '—'}</Td>
                <Td className="text-ink-600">{row.message}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
    </Card>
  )
}
