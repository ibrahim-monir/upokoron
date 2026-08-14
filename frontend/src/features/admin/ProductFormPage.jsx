import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { get, post, put } from '../../lib/api'
import { ApiError } from '../../lib/api'
import { applyServerErrors } from '../auth/applyServerErrors'
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageLoader,
  Select,
  Textarea,
  useToast,
} from '../../components/ui'
import { ProductImages, imagesFromProduct, syncProductImages } from './ProductImages'
import { VariationBuilder } from './VariationBuilder'

/*
 * Mirrors StoreProductRequest, including the two price rules that exist to
 * stop the storefront advertising a price rise as a discount.
 */
const schema = z
  .object({
    name: z.string().min(1, 'Enter a product name.').max(200),
    category_id: z.coerce.number({ message: 'Choose a category.' }).int().positive(),
    brand_id: z.union([z.coerce.number().int().positive(), z.literal('')]).optional(),
    unit_id: z.union([z.coerce.number().int().positive(), z.literal('')]).optional(),
    type: z.enum(['simple', 'variable']),
    status: z.enum(['draft', 'active', 'archived']),
    short_description: z.string().max(500).optional().or(z.literal('')),
    description: z.string().max(65000).optional().or(z.literal('')),
    sku: z.string().max(60).optional().or(z.literal('')),
    barcode: z.string().max(60).optional().or(z.literal('')),
    selling_price: z.coerce.number({ message: 'Enter a price.' }).min(0),

    /*
     * The empty literal goes FIRST in these unions, and that ordering is the
     * whole point.
     *
     * A union tries its options in order. With `z.coerce.number().min(0)`
     * first, an empty box coerces to 0 and passes -- so "no compare-at
     * price" silently became "compare-at price of zero", and the rule below
     * then rejected the product with a message about a price the user never
     * entered. Leaving the field blank made the form unusable.
     *
     * It bites here and not on brand or unit because those coerce to 0 and
     * then FAIL `.positive()`, falling through to the literal by luck rather
     * than design.
     */
    compare_at_price: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
    is_stock_tracked: z.boolean(),
    is_featured: z.boolean(),
    weight: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
    length: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
    width: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
    height: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
    warranty: z.string().max(120).optional().or(z.literal('')),

    special_price: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
    special_starts_at: z.string().optional().or(z.literal('')),
    special_ends_at: z.string().optional().or(z.literal('')),

    slug: z.string().max(220).optional().or(z.literal('')),
    meta_title: z.string().max(160).optional().or(z.literal('')),
    meta_description: z.string().max(320).optional().or(z.literal('')),
    published_at: z.string().optional().or(z.literal('')),
  })
  .refine(
    (v) =>
      v.special_price === '' ||
      v.special_price == null ||
      v.selling_price == null ||
      v.special_price < v.selling_price,
    {
      // An "offer" above the normal price is not an offer. Caught here
      // rather than letting the shop advertise a rise as a discount.
      message: 'The offer price must be lower than the selling price.',
      path: ['special_price'],
    },
  )
  .refine(
    (v) => !v.special_ends_at || !v.special_starts_at || v.special_ends_at > v.special_starts_at,
    { message: 'The offer must end after it starts.', path: ['special_ends_at'] },
  )
  .refine((v) => !v.special_price || Boolean(v.special_ends_at), {
    // The same rule the API enforces, checked here so it is answered before
    // the form is submitted rather than after.
    message: 'Give the offer an end date, or it quietly becomes the normal price.',
    path: ['special_ends_at'],
  })
  .refine(
    (v) => v.compare_at_price === '' || v.compare_at_price == null || v.compare_at_price > v.selling_price,
    {
      message: 'The compare-at price is what it used to cost, so it must be higher than the selling price.',
      path: ['compare_at_price'],
    },
  )

/**
 * ISO 8601 from the API into what `datetime-local` accepts.
 *
 * The control wants "YYYY-MM-DDTHH:mm" with no zone, and silently shows an
 * empty box for anything else -- so an offer with dates set would look like
 * an offer with none, and be wiped on the next save.
 */
function forInput(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const pad = (n) => String(n).padStart(2, '0')

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function ProductFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const toast = useToast()
  const [saving, setSaving] = useState(false)

  /*
   * The gallery is held here rather than saved as it is edited, because a
   * new product has no id to attach images to yet. `originalImages` is what
   * the server had, so the save can work out what was removed.
   */
  const [images, setImages] = useState([])
  const [originalImages, setOriginalImages] = useState([])

  /*
   * Which attribute values a variable product comes in, as
   * { attributeId: [valueId, ...] }. Held here because the API wants it as
   * one `attributes` key alongside the rest of the product, and because
   * choosing "Variable" without it fails validation on a field the form
   * never showed.
   */
  const [attributes, setAttributes] = useState({})

  const categories = useQuery({
    queryKey: ['admin', 'categories', 'options'],
    queryFn: () => get('/admin/categories'),
  })

  const brands = useQuery({
    queryKey: ['admin', 'brands', 'options'],
    queryFn: () => get('/admin/brands'),
  })

  const units = useQuery({
    queryKey: ['admin', 'units', 'options'],
    queryFn: () => get('/admin/units'),
  })

  const existing = useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => get(`/admin/products/${id}`),
    enabled: isEdit,
    select: (response) => response.data,
  })

  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      category_id: '',
      brand_id: '',
      unit_id: '',
      type: 'simple',
      status: 'draft',
      short_description: '',
      description: '',
      sku: '',
      barcode: '',
      selling_price: '',
      compare_at_price: '',
      is_stock_tracked: true,
      is_featured: false,
      weight: '',
      length: '',
      width: '',
      height: '',
      warranty: '',
      special_price: '',
      special_starts_at: '',
      special_ends_at: '',
      slug: '',
      meta_title: '',
      meta_description: '',
      published_at: '',
    },
  })

  useEffect(() => {
    if (!existing.data) return

    const product = existing.data
    const variation = product.default_variation ?? product.variations?.[0]

    reset({
      name: product.name,
      category_id: product.category?.id ?? '',
      brand_id: product.brand?.id ?? '',
      unit_id: product.unit?.id ?? '',
      type: product.type,
      status: product.status,
      short_description: product.short_description ?? '',
      description: product.description ?? '',
      sku: variation?.sku ?? '',
      barcode: variation?.barcode ?? '',
      selling_price: variation?.selling_price ?? '',
      compare_at_price: variation?.compare_at_price ?? '',
      is_stock_tracked: product.is_stock_tracked,
      is_featured: product.is_featured,
      weight: product.weight ?? '',
      length: product.length ?? '',
      width: product.width ?? '',
      height: product.height ?? '',
      warranty: product.warranty ?? '',

      // datetime-local wants "YYYY-MM-DDTHH:mm"; the API sends ISO 8601 with
      // an offset, which the control silently refuses to display.
      special_price: variation?.special_price ?? '',
      special_starts_at: forInput(variation?.special_starts_at),
      special_ends_at: forInput(variation?.special_ends_at),

      slug: product.slug ?? '',
      meta_title: product.meta_title ?? '',
      meta_description: product.meta_description ?? '',
      published_at: forInput(product.published_at),
    })

    const loaded = imagesFromProduct(product)

    setImages(loaded)
    setOriginalImages(loaded)
  }, [existing.data, reset])

  const type = watch('type')

  const onSubmit = async (values) => {
    const chosen = Object.fromEntries(
      Object.entries(attributes).filter(([, ids]) => ids.length > 0),
    )

    /*
     * Caught here rather than by the API, which answers "the attributes field
     * is required" -- correct, and meaningless to anyone who has not read the
     * request class.
     */
    if (values.type === 'variable' && Object.keys(chosen).length === 0) {
      toast.error('Choose what this product varies by, or set its type to Simple.')
      return
    }

    setSaving(true)

    const payload = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]),
    )

    if (values.type === 'variable') {
      payload.attributes = chosen
    }

    try {
      let productId = id

      if (isEdit) {
        await put(`/admin/products/${id}`, payload)
      } else {
        // Images need an id to hang off, so the product is created first and
        // the gallery written straight after. The create response nests the
        // record under `product`, not `data`.
        const created = await post('/admin/products', payload)

        productId = created.product?.id
      }

      if (productId) {
        await syncProductImages(productId, images, originalImages)
      }

      toast.success(isEdit ? 'Product updated.' : 'Product created.')

      navigate('/admin/products')
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
      } else {
        toast.error('Could not save the product.')
      }
    } finally {
      setSaving(false)
    }
  }

  const categoryOptions = useMemo(() => categories.data?.data ?? [], [categories.data])

  if (isEdit && existing.isLoading) return <PageLoader label="Loading product" />


  /*
   * Two columns, not one long scroll.
   *
   * The left column is what the product IS -- name, pictures, price, what it
   * comes in. The right is what the shop DOES with it -- publish or not,
   * where it is filed, whether stock is counted. Separating the two puts the
   * questions that decide whether a product goes live at the top of the page
   * rather than a screen and a half down.
   *
   * The save bar sticks, because the form is long enough that a button at the
   * bottom of it is a scroll away from wherever you are working.
   */
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5 pb-4" noValidate>
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-b border-ink-200 bg-ink-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <button
          type="button"
          onClick={() => navigate('/admin/products')}
          aria-label="Back to products"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold leading-tight text-ink-900">
            {isEdit ? watch('name') || 'Edit product' : 'New product'}
          </h1>
          <p className="text-xs text-ink-500">
            {isEdit ? 'Editing an existing product' : 'Fill in the essentials, the rest can wait'}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/products')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ---------------------------------------------------- main column */}
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Basics" />

            <div className="grid gap-4 p-4">
              <Field
                label="Product name"
                required
                placeholder="Baseus 65W GaN Charger"
                error={errors.name?.message}
                {...register('name')}
              />

              <Field
                label="Short description"
                placeholder="One line, shown under the name"
                error={errors.short_description?.message}
                {...register('short_description')}
              />

              <Field label="Description" error={errors.description?.message}>
                {({ id: fieldId }) => <Textarea id={fieldId} rows={6} {...register('description')} />}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Images"
              description="The first image is what the shop, the search results and every product card show."
            />

            <div className="p-4">
              <ProductImages productId={isEdit ? id : null} value={images} onChange={setImages} />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Price"
              description={
                type === 'variable'
                  ? 'The starting price. Each variation can override it.'
                  : 'What it costs to buy comes from the stock ledger, never from here.'
              }
            />

            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Field
                label="Selling price"
                required
                type="number"
                step="0.01"
                min="0"
                error={errors.selling_price?.message}
                {...register('selling_price')}
              />

              <Field
                label="Compare-at price"
                type="number"
                step="0.01"
                min="0"
                hint="What it used to cost. Shown struck through."
                error={errors.compare_at_price?.message}
                {...register('compare_at_price')}
              />

              {/*
                The offer is a different claim from the compare-at price.
                Compare-at is about the past; this is what it costs right now,
                for a window. One box for both is how shops end up running a
                discount that never ends.
              */}
              <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-3 sm:col-span-2">
                <p className="text-sm font-medium text-ink-800">Offer price</p>
                <p className="mt-0.5 text-xs text-ink-500">
                  Optional. Replaces the selling price while it runs.
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <Field
                    label="Offer price"
                    type="number"
                    step="0.01"
                    min="0"
                    error={errors.special_price?.message}
                    {...register('special_price')}
                  />
                  <Field
                    label="Starts"
                    type="datetime-local"
                    hint="Blank = now"
                    error={errors.special_starts_at?.message}
                    {...register('special_starts_at')}
                  />
                  {/*
                    Required, not optional, and the label says so. An offer
                    with no end date is not an offer -- it silently becomes
                    the price, and the shop keeps advertising a discount that
                    ended months ago. The API refuses it; this stops the user
                    finding that out only after pressing Save.
                  */}
                  <Field
                    label="Ends"
                    type="datetime-local"
                    required={Boolean(watch('special_price'))}
                    hint="An offer needs an end"
                    error={errors.special_ends_at?.message}
                    {...register('special_ends_at')}
                  />
                </div>
              </div>
            </div>
          </Card>

          {type === 'variable' && (
            <Card>
              <CardHeader
                title="Variations"
                description="What this product comes in. One variation is created per combination."
              />

              <div className="p-4">
                <VariationBuilder value={attributes} onChange={setAttributes} />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Shipping and warranty"
              description="Weight and size decide what the courier charges."
            />

            <div className="grid gap-4 p-4 sm:grid-cols-4">
              <Field
                label="Weight (kg)"
                type="number"
                step="0.001"
                min="0"
                error={errors.weight?.message}
                {...register('weight')}
              />
              <Field label="Length (cm)" type="number" step="0.1" min="0" {...register('length')} />
              <Field label="Width (cm)" type="number" step="0.1" min="0" {...register('width')} />
              <Field label="Height (cm)" type="number" step="0.1" min="0" {...register('height')} />

              <Field
                className="sm:col-span-4"
                label="Warranty"
                placeholder="6 months brand warranty"
                hint="Shown on the product page. Leave blank if there is none."
                error={errors.warranty?.message}
                {...register('warranty')}
              />
            </div>
          </Card>

          {/* Real, occasionally needed, and not what anyone is here to fill
              in, so it starts closed with sensible defaults behind it. */}
          <details className="rounded-card border border-ink-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink-900">
              Search engines and link
            </summary>

            <div className="grid gap-4 border-t border-ink-100 p-4">
              <Field
                label="Link (slug)"
                placeholder="left blank, made from the name"
                hint="Changing this on a live product breaks links people have saved."
                error={errors.slug?.message}
                {...register('slug')}
              />

              <Field
                label="Page title"
                hint="Up to 160 characters. Blank uses the product name."
                error={errors.meta_title?.message}
                {...register('meta_title')}
              />

              <Field label="Page description" error={errors.meta_description?.message}>
                {({ id: fieldId }) => <Textarea id={fieldId} rows={2} {...register('meta_description')} />}
              </Field>
            </div>
          </details>
        </div>

        {/* ------------------------------------------------------- sidebar */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-20">
          <Card>
            <CardHeader title="Publishing" />

            <div className="grid gap-4 p-4">
              <Field label="Status" required error={errors.status?.message}>
                {({ id: fieldId }) => (
                  <Select id={fieldId} {...register('status')}>
                    <option value="draft">Draft — hidden</option>
                    <option value="active">Active — on sale</option>
                    <option value="archived">Archived — withdrawn</option>
                  </Select>
                )}
              </Field>

              <Field
                label="Publish on"
                type="datetime-local"
                hint="Blank publishes as soon as it is Active."
                error={errors.published_at?.message}
                {...register('published_at')}
              />

              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" className="h-4 w-4 rounded border-ink-300" {...register('is_featured')} />
                Feature on the home page
              </label>
            </div>
          </Card>

          <Card>
            <CardHeader title="Organisation" />

            <div className="grid gap-4 p-4">
              {/*
                The type control was missing entirely, which is why Variable
                could never be chosen and the variation handling below it had
                nothing to run on.
              */}
              <Field
                label="Type"
                required
                hint={type === 'variable' ? 'Comes in options: colours, sizes.' : 'One version only.'}
              >
                {({ id: fieldId }) => (
                  <Select id={fieldId} {...register('type')}>
                    <option value="simple">Simple</option>
                    <option value="variable">Variable</option>
                  </Select>
                )}
              </Field>

              <Field label="Category" required error={errors.category_id?.message}>
                {({ id: fieldId, invalid }) => (
                  <Select id={fieldId} invalid={invalid} {...register('category_id')}>
                    <option value="">Choose a category</option>
                    {categoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {'— '.repeat(category.depth ?? 0)}
                        {category.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Brand" error={errors.brand_id?.message}>
                {({ id: fieldId }) => (
                  <Select id={fieldId} {...register('brand_id')}>
                    <option value="">No brand</option>
                    {(brands.data?.data ?? []).map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label="Sold by" hint="Pieces cannot be sold in halves; kilograms can.">
                {({ id: fieldId }) => (
                  <Select id={fieldId} {...register('unit_id')}>
                    <option value="">No unit</option>
                    {(units.data?.data ?? []).map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name} ({unit.short_name})
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Stock" />

            <div className="grid gap-4 p-4">
              <label className="flex items-start gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-ink-300"
                  {...register('is_stock_tracked')}
                />
                <span>
                  Count stock
                  <span className="block text-xs text-ink-500">
                    Off for made-to-order items, which never run out.
                  </span>
                </span>
              </label>

              <Field
                label="SKU"
                hint="Left blank, one is generated."
                error={errors.sku?.message}
                {...register('sku')}
              />
              <Field label="Barcode" error={errors.barcode?.message} {...register('barcode')} />

              {isEdit && (
                <p className="text-xs text-ink-500">
                  Quantities are changed from{' '}
                  <span className="font-medium text-ink-700">Stock → Inventory</span>, so every
                  movement is recorded.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </form>
  )
}
