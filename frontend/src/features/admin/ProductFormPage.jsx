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
  })
  .refine(
    (v) => v.compare_at_price === '' || v.compare_at_price == null || v.compare_at_price > v.selling_price,
    {
      message: 'The compare-at price is what it used to cost, so it must be higher than the selling price.',
      path: ['compare_at_price'],
    },
  )

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
    })

    const loaded = imagesFromProduct(product)

    setImages(loaded)
    setOriginalImages(loaded)
  }, [existing.data, reset])

  const type = watch('type')

  const onSubmit = async (values) => {
    setSaving(true)

    const payload = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]),
    )

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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate('/admin/products')}
        className="flex w-fit items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to products
      </button>

      <h1 className="text-xl font-semibold text-ink-900">
        {isEdit ? 'Edit product' : 'New product'}
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Card>
          <CardHeader title="Basics" />
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <Field
              label="Product name"
              required
              className="sm:col-span-2"
              error={errors.name?.message}
              {...register('name')}
            />

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

            <Field label="Status" required error={errors.status?.message}>
              {({ id: fieldId }) => (
                <Select id={fieldId} {...register('status')}>
                  <option value="draft">Draft — not visible in the shop</option>
                  <option value="active">Active — on sale</option>
                  <option value="archived">Archived — withdrawn</option>
                </Select>
              )}
            </Field>

            <Field
              label="Short description"
              className="sm:col-span-2"
              error={errors.short_description?.message}
              {...register('short_description')}
            />

            <Field label="Description" className="sm:col-span-2" error={errors.description?.message}>
              {({ id: fieldId }) => <Textarea id={fieldId} rows={5} {...register('description')} />}
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
            title="Price and stock"
            description={
              type === 'variable'
                ? 'This price applies to every variation unless one overrides it.'
                : 'Cost of goods sold comes from the stock ledger, never from here.'
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
              hint="Shown struck through. Must be higher than the selling price."
              error={errors.compare_at_price?.message}
              {...register('compare_at_price')}
            />

            <Field label="SKU" hint="Left blank, one is generated." error={errors.sku?.message} {...register('sku')} />
            <Field label="Barcode" error={errors.barcode?.message} {...register('barcode')} />

            <Field
              label="Weight (kg)"
              type="number"
              step="0.001"
              min="0"
              error={errors.weight?.message}
              {...register('weight')}
            />

            <div className="flex flex-col justify-end gap-3 pb-1">
              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" className="h-4 w-4 rounded border-ink-300" {...register('is_stock_tracked')} />
                Track stock for this product
              </label>

              <label className="flex items-center gap-2 text-sm text-ink-700">
                <input type="checkbox" className="h-4 w-4 rounded border-ink-300" {...register('is_featured')} />
                Feature on the home page
              </label>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => navigate('/admin/products')}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </div>
      </form>
    </div>
  )
}
