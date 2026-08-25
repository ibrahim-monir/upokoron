import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'

import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Image as ImageIcon,
  Info,
  Package,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Tag,
  Trash2,
} from 'lucide-react'

import { get, post, put } from '../../lib/api'
import { ApiError } from '../../lib/api'
import { cx, datetimeLocalValue } from '../../lib/format'
import { applyServerErrors } from '../auth/applyServerErrors'

import {
  Button,
  Card,
  Field,
  Input,
  PageLoader,
  RichTextEditor,
  Select,
  Textarea,
  useToast,
} from '../../components/ui'

import {
  ProductImages,
  imagesFromProduct,
  syncProductImages,
} from './ProductImages'

import { VariationBuilder } from './VariationBuilder'

/* ==========================================================================
   VALIDATION
   ========================================================================== */

const schema = z
  .object({
    /* Basic information */
    name: z
      .string()
      .min(1, 'Enter a product name.')
      .max(200),

    slug: z
      .string()
      .max(220)
      .optional()
      .or(z.literal('')),

    type: z.enum(['simple', 'variable']),

    category_id: z.coerce
      .number({
        message: 'Choose a category.',
      })
      .int()
      .positive(),

    brand_id: z
      .union([
        z.coerce.number().int().positive(),
        z.literal(''),
      ])
      .optional(),

    unit_id: z
      .union([
        z.coerce.number().int().positive(),
        z.literal(''),
      ])
      .optional(),

    sku: z
      .string()
      .max(60)
      .optional()
      .or(z.literal('')),

    barcode: z
      .string()
      .max(60)
      .optional()
      .or(z.literal('')),

    /* Content */
    short_description: z
      .string()
      .max(500)
      .optional()
      .or(z.literal('')),

    short_description_style: z
      .enum(['paragraph', 'list'])
      .optional()
      .or(z.literal('')),

    description: z
      .string()
      .max(65000)
      .optional()
      .or(z.literal('')),

    /* Pricing */
    selling_price: z.coerce
      .number({
        message: 'Enter a price.',
      })
      .min(0),

    compare_at_price: z
      .union([
        z.literal(''),
        z.coerce.number().min(0),
      ])
      .optional(),

    special_price: z
      .union([
        z.literal(''),
        z.coerce.number().min(0),
      ])
      .optional(),

    special_starts_at: z
      .string()
      .optional()
      .or(z.literal('')),

    special_ends_at: z
      .string()
      .optional()
      .or(z.literal('')),

    /* Inventory */
    is_stock_tracked: z.boolean(),

    stock_quantity: z
      .union([
        z.literal(''),
        z.coerce.number().min(0),
      ])
      .optional(),

    low_stock_threshold: z
      .union([
        z.literal(''),
        z.coerce.number().min(0),
      ])
      .optional(),

    stock_unit_cost: z
      .union([
        z.literal(''),
        z.coerce.number().min(0),
      ])
      .optional(),

    /* Shipping */
    weight: z
      .union([
        z.literal(''),
        z.coerce.number().min(0),
      ])
      .optional(),

    length: z
      .union([
        z.literal(''),
        z.coerce.number().min(0),
      ])
      .optional(),

    width: z
      .union([
        z.literal(''),
        z.coerce.number().min(0),
      ])
      .optional(),

    height: z
      .union([
        z.literal(''),
        z.coerce.number().min(0),
      ])
      .optional(),

    warranty: z
      .string()
      .max(120)
      .optional()
      .or(z.literal('')),

    /* Publishing */
    status: z.enum([
      'draft',
      'active',
      'archived',
    ]),

    published_at: z
      .string()
      .optional()
      .or(z.literal('')),

    is_featured: z.boolean(),

    /* SEO */
    meta_title: z
      .string()
      .max(160)
      .optional()
      .or(z.literal('')),

    meta_description: z
      .string()
      .max(320)
      .optional()
      .or(z.literal('')),
  })

  .refine(
    (value) =>
      value.special_price === '' ||
      value.special_price == null ||
      value.selling_price == null ||
      value.special_price < value.selling_price,
    {
      message:
        'Offer price must be lower than the selling price.',
      path: ['special_price'],
    },
  )

  .refine(
    (value) =>
      !value.special_ends_at ||
      !value.special_starts_at ||
      value.special_ends_at >
        value.special_starts_at,
    {
      message:
        'Offer must end after it starts.',
      path: ['special_ends_at'],
    },
  )

  .refine(
    (value) =>
      !value.special_price ||
      Boolean(value.special_ends_at),
    {
      message:
        'An offer needs an end date.',
      path: ['special_ends_at'],
    },
  )

  .refine(
    (value) =>
      value.compare_at_price === '' ||
      value.compare_at_price == null ||
      value.compare_at_price >
        value.selling_price,
    {
      message:
        'Compare-at price must be higher than selling price.',
      path: ['compare_at_price'],
    },
  )

/* ==========================================================================
   ADDITIONAL PRODUCTS
   ========================================================================== */

/**
 * Pick the accessories that go with this product.
 *
 * A search box rather than a checkbox list: a shop with a few hundred
 * products cannot be scrolled through to find the one cable that goes with
 * this battery, and the list would be mostly noise either way.
 */
function PairedProductPicker({ selected, onChange, excludeId }) {
  const [term, setTerm] = useState('')

  // Whatever is already picked, so the chips can show names rather than ids
  // -- including on first load, before anything has been searched for.
  const chosen = useQuery({
    queryKey: ['admin', 'products', 'paired', selected],
    queryFn: () => get('/admin/products', { params: { per_page: 100 } }),
    enabled: selected.length > 0,
    select: (response) =>
      (response.data ?? []).filter((product) => selected.includes(product.id)),
  })

  const results = useQuery({
    queryKey: ['admin', 'products', 'pair-search', term],
    queryFn: () => get('/admin/products', { params: { search: term, per_page: 8 } }),
    enabled: term.trim().length >= 2,
    select: (response) => response.data ?? [],
  })

  const toggle = (productId) =>
    onChange(
      selected.includes(productId)
        ? selected.filter((value) => value !== productId)
        : [...selected, productId],
    )

  const matches = (results.data ?? []).filter(
    (product) => product.id !== excludeId,
  )

  return (
    <div className="mt-2 rounded-lg border border-ink-200 p-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400"
          aria-hidden="true"
        />

        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search products to add..."
          aria-label="Search products to pair"
          className="h-10 w-full rounded-lg border border-ink-200 pl-9 pr-3 text-sm"
        />
      </div>

      {term.trim().length >= 2 && (
        <ul className="mt-2 max-h-48 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-200">
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm text-ink-500">
              {results.isFetching ? 'Searching…' : 'Nothing matched.'}
            </li>
          ) : (
            matches.map((product) => {
              const checked = selected.includes(product.id)

              return (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => toggle(product.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-ink-50"
                  >
                    <span
                      className={cx(
                        'grid h-4 w-4 shrink-0 place-items-center rounded border',
                        checked
                          ? 'border-brand-600 bg-brand-600 text-white'
                          : 'border-ink-300',
                      )}
                    >
                      {checked && <Check className="h-3 w-3" aria-hidden="true" />}
                    </span>

                    <span className="min-w-0 flex-1 truncate text-ink-800">
                      {product.name}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(chosen.data ?? []).map((product) => (
            <span
              key={product.id}
              className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1 text-xs font-medium text-brand-800"
            >
              {product.name}

              <button
                type="button"
                onClick={() => toggle(product.id)}
                aria-label={`Remove ${product.name}`}
                className="grid h-4 w-4 place-items-center rounded-full text-brand-800 hover:bg-brand-100"
              >
                <Trash2 className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ==========================================================================
   STOCK HELPERS
   ========================================================================== */

/**
 * The API returns fixed-scale decimal strings ("12.000", "0.000000").
 * A number input would show those verbatim, so pull them back to a plain
 * number before they reach the form.
 */
function decimalValue(value, fallback = '') {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return fallback
  }

  const number = Number(value)

  return Number.isFinite(number)
    ? number
    : fallback
}

/**
 * A best-effort client-side preview of what the server will generate --
 * the server has the last word (transliteration, uniqueness), this just
 * saves the admin from staring at a blank slug field while they type.
 */
function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Quantities are decimal(_,3); round to that scale so 0.1+0.2 cannot leak. */
function round3(value) {
  return (
    Math.round(value * 1000) / 1000
  )
}

/**
 * A simple product still has exactly one variation behind it, and that
 * variation -- not the product -- is what inventory is keyed on.
 */
function defaultVariationOf(product) {
  if (!product) return null

  return (
    product.default_variation ??
    product.variations?.find(
      (item) => item.is_default,
    ) ??
    product.variations?.[0] ??
    null
  )
}

/* ==========================================================================
   SMALL UI COMPONENTS
   ========================================================================== */

function SectionHeader({
  icon: Icon,
  title,
  description,
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600">
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-ink-900">
          {title}
        </h2>

        {description && (
          <p className="mt-0.5 text-xs leading-5 text-ink-500">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}

function SidebarSection({
  icon: Icon,
  title,
  description,
  children,
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-ink-100 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-ink-100 text-ink-600">
            <Icon className="h-4 w-4" />
          </div>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink-900">
              {title}
            </h3>

            {description && (
              <p className="text-[11px] text-ink-500">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        {children}
      </div>
    </Card>
  )
}

function StatusBadge({ status }) {
  const styles = {
    draft:
      'bg-amber-50 text-amber-700 ring-amber-200',

    active:
      'bg-emerald-50 text-emerald-700 ring-emerald-200',

    archived:
      'bg-ink-100 text-ink-600 ring-ink-200',
  }

  const labels = {
    draft: 'Draft',
    active: 'Active',
    archived: 'Archived',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${
        styles[status] ?? styles.draft
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />

      {labels[status] ?? 'Draft'}
    </span>
  )
}

/* ==========================================================================
   PAGE
   ========================================================================== */

export default function ProductFormPage() {
  const { id } = useParams()

  const isEdit = Boolean(id)

  const navigate = useNavigate()
  const toast = useToast()

  const [saving, setSaving] =
    useState(false)

  const [images, setImages] =
    useState([])

  const [originalImages, setOriginalImages] =
    useState([])

  const [attributes, setAttributes] =
    useState({})

  const [additionalInfo, setAdditionalInfo] =
    useState([])


  // Accessories: what goes WITH this product, as opposed to the same-category
  // products that are alternatives TO it.
  const [pairedIds, setPairedIds] =
    useState([])

  const [seoOpen, setSeoOpen] =
    useState(false)

  /* ------------------------------------------------------------------------
     Queries
     ------------------------------------------------------------------------ */

  const categories = useQuery({
    queryKey: [
      'admin',
      'categories',
      'options',
    ],

    queryFn: () =>
      get('/admin/categories'),
  })

  const brands = useQuery({
    queryKey: [
      'admin',
      'brands',
      'options',
    ],

    queryFn: () =>
      get('/admin/brands'),
  })

  const units = useQuery({
    queryKey: [
      'admin',
      'units',
      'options',
    ],

    queryFn: () =>
      get('/admin/units'),
  })

  const existing = useQuery({
    queryKey: [
      'admin',
      'product',
      id,
    ],

    queryFn: () =>
      get(`/admin/products/${id}`),

    enabled: isEdit,

    select: (response) =>
      response.data,
  })

  /* ------------------------------------------------------------------------
     Form
     ------------------------------------------------------------------------ */

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),

    defaultValues: {
      /* Basic */
      name: '',
      slug: '',
      type: 'simple',
      category_id: '',
      brand_id: '',
      unit_id: '',
      sku: '',
      barcode: '',

      /* Content */
      short_description: '',
      short_description_style: 'paragraph',
      description: '',

      /* Pricing */
      selling_price: '',
      compare_at_price: '',
      special_price: '',
      special_starts_at: '',
      special_ends_at: '',

      /* Inventory */
      is_stock_tracked: true,
      stock_quantity: '',
      low_stock_threshold: 5,
      stock_unit_cost: '',

      /* Shipping */
      weight: '',
      length: '',
      width: '',
      height: '',
      warranty: '',

      /* Publishing */
      status: 'draft',
      published_at: '',
      is_featured: false,

      /* SEO */
      meta_title: '',
      meta_description: '',
    },
  })

  const type = useWatch({
    control,
    name: 'type',
  })

  const status = useWatch({
    control,
    name: 'status',
  })

  const productName = useWatch({
    control,
    name: 'name',
  })

  /*
   * The slug tracks the name until the admin types into the slug field
   * themselves -- at that point their spelling wins and the name may keep
   * changing without dragging the slug (and every link to the product)
   * along with it.
   */
  const [slugAuto, setSlugAuto] = useState(!isEdit)

  useEffect(() => {
    if (!slugAuto) return

    setValue('slug', slugify(productName || ''), { shouldValidate: false })
  }, [productName, slugAuto, setValue])

  const specialPrice = useWatch({
    control,
    name: 'special_price',
  })

  const isStockTracked = useWatch({
    control,
    name: 'is_stock_tracked',
  })

  const shortDescriptionStyle = useWatch({
    control,
    name: 'short_description_style',
  })

  const stockQuantity = useWatch({
    control,
    name: 'stock_quantity',
  })

  /* What inventory currently holds, i.e. what a new figure is diffed against. */
  const currentStock = useMemo(() => {
    const stock =
      defaultVariationOf(
        existing.data,
      )?.stock

    return {
      quantity: decimalValue(
        stock?.quantity,
        0,
      ),
      reorderLevel: decimalValue(
        stock?.reorder_level,
        0,
      ),
      hasMovements: Boolean(
        stock?.has_movements,
      ),
    }
  }, [existing.data])

  const stockOnRecord =
    currentStock.quantity

  /* The movement this save would post, previewed before it happens. */
  const stockDelta = useMemo(() => {
    const desired = decimalValue(
      stockQuantity,
      null,
    )

    return desired === null
      ? 0
      : round3(
          desired - stockOnRecord,
        )
  }, [
    stockQuantity,
    stockOnRecord,
  ])

  /* ------------------------------------------------------------------------
     Existing product
     ------------------------------------------------------------------------ */

  useEffect(() => {
    if (!existing.data) {
      return
    }

    const product =
      existing.data

    // The product already has a real slug; do not start rewriting it just
    // because loading the form touches the name field.
    setSlugAuto(false)

    const variation =
      defaultVariationOf(product)

    /*
     * Stock lives on the variation's inventory row, which the admin show
     * endpoint eager-loads. `quantity` is the on-hand figure, not the
     * available one: this form edits what is physically in stock, and
     * subtracting other people's reservations here would make every save
     * quietly write off the reserved units.
     */

    const stock =
      variation?.stock ?? {}

    const currentStock =
      decimalValue(stock.quantity)

    const lowStockThreshold =
      decimalValue(
        stock.reorder_level,
      )

    reset({
      /* Basic */

      name:
        product.name ?? '',

      slug:
        product.slug ?? '',

      type:
        product.type ?? 'simple',

      category_id:
        product.category?.id ??
        product.category_id ??
        '',

      brand_id:
        product.brand?.id ??
        product.brand_id ??
        '',

      unit_id:
        product.unit?.id ??
        product.unit_id ??
        '',

      sku:
        variation?.sku ??
        product.sku ??
        '',

      barcode:
        variation?.barcode ??
        product.barcode ??
        '',

      /* Content */

      short_description:
        product.short_description ??
        '',

      short_description_style:
        product.short_description_style ??
        'paragraph',

      description:
        product.description ??
        '',

      /* Pricing */

      selling_price:
        variation?.selling_price ??
        product.selling_price ??
        '',

      compare_at_price:
        variation?.compare_at_price ??
        product.compare_at_price ??
        '',

      special_price:
        variation?.special_price ??
        product.special_price ??
        '',

      special_starts_at:
        datetimeLocalValue(
          variation?.special_starts_at ??
            product.special_starts_at,
        ),

      special_ends_at:
        datetimeLocalValue(
          variation?.special_ends_at ??
            product.special_ends_at,
        ),

      /* Inventory */

      is_stock_tracked:
        product.is_stock_tracked ??
        true,

      stock_quantity:
        currentStock,

      low_stock_threshold:
        lowStockThreshold,

      stock_unit_cost: '',

      /* Shipping */

      weight:
        product.weight ?? '',

      length:
        product.length ?? '',

      width:
        product.width ?? '',

      height:
        product.height ?? '',

      warranty:
        product.warranty ?? '',

      /* Publishing */

      status:
        product.status ?? 'draft',

      published_at:
        datetimeLocalValue(
          product.published_at,
        ),

      is_featured:
        product.is_featured ??
        false,

      /* SEO */

      meta_title:
        product.meta_title ??
        '',

      meta_description:
        product.meta_description ??
        '',
    })

    const loadedImages =
      imagesFromProduct(product)

    setImages(
      loadedImages,
    )

    setOriginalImages(
      loadedImages,
    )

    setAdditionalInfo(
      product.additional_info ??
        [],
    )


    setPairedIds(
      product.paired_product_ids ??
        [],
    )

    if (product.attributes) {
      setAttributes(
        product.attributes,
      )
    }
  }, [
    existing.data,
    reset,
  ])

  /* ------------------------------------------------------------------------
     Options
     ------------------------------------------------------------------------ */

  const categoryOptions =
    useMemo(
      () =>
        categories.data?.data ??
        [],
      [categories.data],
    )

  const brandOptions =
    useMemo(
      () =>
        brands.data?.data ??
        [],
      [brands.data],
    )

  const unitOptions =
    useMemo(
      () =>
        units.data?.data ??
        [],
      [units.data],
    )

  /* ==========================================================================
     STOCK SYNC
     ========================================================================== */

  /*
   * Stock is deliberately kept out of the product payload: the inventory
   * ledger is the source of truth, and it is keyed on the *variation*, not
   * the product.
   *
   * There is no "set stock to N" endpoint, and that is on purpose -- every
   * change has to be a movement with a direction and a cost, or the stock
   * value drifts away from the 1150 control account it is supposed to
   * reconcile with. So the figure typed here is translated into the delta
   * that reaches it, and posted as a real movement.
   */
  const syncStock = async (
    variation,
    values,
    current,
  ) => {
    if (
      !variation?.id ||
      !values.is_stock_tracked
    ) {
      return
    }

    /*
     * A variable product holds stock per variation, so a single box on
     * this form cannot describe it. Inventory owns that case.
     */
    if (
      values.type !== 'simple'
    ) {
      return
    }

    /*
     * Reorder level moves no stock, so it never touches the ledger.
     * Only written when it actually changed: this endpoint needs the
     * inventory permission, and firing it on every save would fail every
     * save for someone who is allowed to edit products but not stock.
     */

    const threshold =
      decimalValue(
        values.low_stock_threshold,
        null,
      )

    if (
      threshold !== null &&
      threshold !==
        current.reorderLevel
    ) {
      await put(
        `/admin/inventory/${variation.id}/levels`,
        {
          reorder_level:
            threshold,
        },
      )
    }

    /* Blank means "leave the stock alone", not "set it to zero". */

    const desired =
      decimalValue(
        values.stock_quantity,
        null,
      )

    if (desired === null) {
      return
    }

    const delta = round3(
      desired - current.quantity,
    )

    if (delta === 0) {
      return
    }

    const unitCost =
      decimalValue(
        values.stock_unit_cost,
        null,
      )

    /*
     * The very first stock a product ever holds is an opening balance.
     * Anything after that is an adjustment, which posts to shrinkage
     * instead. A product that merely sold out still has a history, so it
     * cannot be re-opened -- hence `has_movements` rather than a zero
     * quantity, which the two cases share.
     */
    const isOpening =
      !current.hasMovements &&
      delta > 0

    await post(
      '/admin/inventory/adjust',
      {
        product_variation_id:
          variation.id,

        quantity:
          Math.abs(delta),

        type: isOpening
          ? 'opening'
          : 'adjustment',

        // The backend rejects a direction on an opening balance.
        direction: isOpening
          ? undefined
          : delta > 0
            ? 'in'
            : 'out',

        unit_cost: unitCost,

        note: isOpening
          ? 'Opening stock'
          : 'Set from the product form',
      },
    )
  }

  /* ==========================================================================
     SUBMIT
     ========================================================================== */

  const onSubmit = async (
    values,
  ) => {
    const chosen =
      Object.fromEntries(
        Object.entries(
          attributes,
        ).filter(
          ([, ids]) =>
            Array.isArray(ids) &&
            ids.length > 0,
        ),
      )

    /* Variable validation */

    if (
      values.type ===
        'variable' &&
      Object.keys(chosen).length ===
        0
    ) {
      toast.error(
        'Choose at least one attribute for the variable product.',
      )

      return
    }

    setSaving(true)

    /*
     * Create product payload.
     *
     * Stock fields are removed because inventory
     * is handled separately.
     */

    const payload =
      Object.fromEntries(
        Object.entries(
          values,
        ).map(
          ([key, value]) => [
            key,
            value === ''
              ? null
              : value,
          ],
        ),
      )

    delete payload.stock_quantity

    delete payload.low_stock_threshold

    delete payload.stock_unit_cost

    /* Variable attributes */

    if (
      values.type ===
      'variable'
    ) {
      payload.attributes =
        chosen
    }

    /* Additional information */

    payload.additional_info =
      additionalInfo.filter(
        (row) =>
          row.feature?.trim() &&
          row.description?.trim(),
      )

    payload.paired_product_ids =
      pairedIds

    try {
      let productId = id
      let variation = null

      /* --------------------------------------------------------------
         Save product
         -------------------------------------------------------------- */

      if (isEdit) {
        await put(
          `/admin/products/${id}`,
          payload,
        )

        variation =
          defaultVariationOf(
            existing.data,
          )
      } else {
        const created =
          await post(
            '/admin/products',
            payload,
          )

        const product =
          created.product ??
          created.data

        productId = product?.id

        // Creating a product always creates its variations, so the row
        // inventory hangs off is in this response.
        variation =
          defaultVariationOf(
            product,
          )
      }

      /* --------------------------------------------------------------
         Sync images
         -------------------------------------------------------------- */

      if (productId) {
        await syncProductImages(
          productId,
          images,
          originalImages,
        )
      }

      /* --------------------------------------------------------------
         Sync inventory

         The product is already saved by this point. A stock movement can
         still be refused on its own -- most often because this account
         can adjust products but not inventory -- and reporting that as a
         failed save would invite a second submit and a duplicate product.
         So it is reported separately and the save still stands.
         -------------------------------------------------------------- */

      let stockError = null

      try {
        await syncStock(
          variation,
          values,
          currentStock,
        )
      } catch (error) {
        stockError =
          error instanceof ApiError
            ? error.message
            : 'Stock could not be updated.'
      }

      if (stockError) {
        toast.error(
          `${
            isEdit
              ? 'Product updated'
              : 'Product created'
          }, but stock was not changed: ${stockError}`,
        )
      } else {
        toast.success(
          isEdit
            ? 'Product updated successfully.'
            : 'Product created successfully.',
        )
      }

      navigate(
        '/admin/products',
      )
    } catch (error) {
      if (
        error instanceof ApiError
      ) {
        applyServerErrors(
          error,
          setError,
          toast,
        )
      } else {
        toast.error(
          'Could not save the product.',
        )
      }
    } finally {
      setSaving(false)
    }
  }

  /* ------------------------------------------------------------------------
     Loading
     ------------------------------------------------------------------------ */

  if (
    isEdit &&
    existing.isLoading
  ) {
    return (
      <PageLoader
        label="Loading product"
      />
    )
  }

  /* ==========================================================================
     RENDER
     ========================================================================== */

  return (
    <form
      onSubmit={handleSubmit(
        onSubmit,
      )}
      noValidate
      className="min-h-screen pb-10"
    >
      {/* =====================================================================
         HEADER
         ===================================================================== */}

      <div className="sticky top-0 z-30 -mx-4 border-b border-ink-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3">

          <button
            type="button"
            onClick={() =>
              navigate(
                '/admin/products',
              )
            }
            aria-label="Back to products"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-ink-200 text-ink-500 transition hover:bg-ink-50 hover:text-ink-900"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">

            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-bold text-ink-950 sm:text-lg">
                {productName ||
                  (isEdit
                    ? 'Edit product'
                    : 'New product')}
              </h1>

              <StatusBadge
                status={status}
              />
            </div>

            <p className="hidden text-xs text-ink-500 sm:block">
              {isEdit
                ? 'Manage product information, pricing and inventory.'
                : 'Add a new product to your store.'}
            </p>

          </div>

          <div className="flex shrink-0 gap-2">

            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                navigate(
                  '/admin/products',
                )
              }
            >
              Cancel
            </Button>

            <Button
              type="submit"
              loading={saving}
            >
              {isEdit
                ? 'Save changes'
                : 'Create product'}
            </Button>

          </div>
        </div>
      </div>

      {/* =====================================================================
         CONTENT
         ===================================================================== */}

      <div className="mx-auto mt-5 max-w-[1600px]">

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">

          {/* =================================================================
             MAIN COLUMN
             ================================================================= */}

          <div className="min-w-0 space-y-5">

            {/* ===============================================================
               01 BASIC INFORMATION
               =============================================================== */}

            <Card className="overflow-hidden">

              <div className="border-b border-ink-100 px-5 py-4">
                <SectionHeader
                  icon={ShoppingBag}
                  title="Basic information"
                  description="Essential information used to identify and organize the product."
                />
              </div>

              <div className="space-y-5 p-5">

                <Field
                  label="Product name"
                  required
                  placeholder="Baseus 65W GaN Charger"
                  error={
                    errors.name?.message
                  }
                  {...register('name')}
                />

                <Field
                  label="Product slug"
                  placeholder="baseus-65w-gan-charger"
                  hint={
                    slugAuto
                      ? 'Auto-filled from the product name -- edit it yourself to take over.'
                      : 'Edited by hand. It will no longer follow the product name.'
                  }
                  error={
                    errors.slug?.message
                  }
                  {...register('slug', {
                    onChange: () => setSlugAuto(false),
                  })}
                />

                <div className="grid gap-5 md:grid-cols-2">

                  <Field
                    label="Product type"
                    required
                    hint={
                      type ===
                      'variable'
                        ? 'Product has multiple variations.'
                        : 'Product has one version.'
                    }
                  >
                    {({
                      id: fieldId,
                    }) => (
                      <Select
                        id={fieldId}
                        {...register(
                          'type',
                        )}
                      >
                        <option value="simple">
                          Simple product
                        </option>

                        <option value="variable">
                          Variable product
                        </option>
                      </Select>
                    )}
                  </Field>

                  <Field
                    label="Category"
                    required
                    error={
                      errors.category_id
                        ?.message
                    }
                  >
                    {({
                      id: fieldId,
                      invalid,
                    }) => (
                      <Select
                        id={fieldId}
                        invalid={invalid}
                        {...register(
                          'category_id',
                        )}
                      >
                        <option value="">
                          Choose category
                        </option>

                        {categoryOptions.map(
                          (
                            category,
                          ) => (
                            <option
                              key={
                                category.id
                              }
                              value={
                                category.id
                              }
                            >
                              {'— '.repeat(
                                category.depth ??
                                  0,
                              )}

                              {
                                category.name
                              }
                            </option>
                          ),
                        )}
                      </Select>
                    )}
                  </Field>

                </div>

                {/*
                   Accessories, picked per product. "Related products" already
                   offers the same category -- alternatives to something the
                   shopper has chosen. These are what goes WITH it: the wire
                   and the connector for a battery.
                */}
                <div>
                  <p className="text-sm font-medium text-ink-800">
                    Additional products
                  </p>

                  <p className="mt-0.5 text-xs text-ink-500">
                    Shown on this product's page as &ldquo;Goes Well With&rdquo;.
                    Search for the accessories that go with it.
                  </p>

                  <PairedProductPicker
                    selected={pairedIds}
                    onChange={setPairedIds}
                    excludeId={id ? Number(id) : null}
                  />
                </div>

                <div className="grid gap-5 md:grid-cols-2">

                  <Field
                    label="Brand"
                    error={
                      errors.brand_id
                        ?.message
                    }
                  >
                    {({
                      id: fieldId,
                    }) => (
                      <Select
                        id={fieldId}
                        {...register(
                          'brand_id',
                        )}
                      >
                        <option value="">
                          No brand
                        </option>

                        {brandOptions.map(
                          (brand) => (
                            <option
                              key={
                                brand.id
                              }
                              value={
                                brand.id
                              }
                            >
                              {
                                brand.name
                              }
                            </option>
                          ),
                        )}
                      </Select>
                    )}
                  </Field>

                  <Field
                    label="Sold by"
                    hint="Example: Piece, Kg, Box."
                    error={
                      errors.unit_id
                        ?.message
                    }
                  >
                    {({
                      id: fieldId,
                    }) => (
                      <Select
                        id={fieldId}
                        {...register(
                          'unit_id',
                        )}
                      >
                        <option value="">
                          No unit
                        </option>

                        {unitOptions.map(
                          (unit) => (
                            <option
                              key={
                                unit.id
                              }
                              value={
                                unit.id
                              }
                            >
                              {
                                unit.name
                              } (
                              {
                                unit.short_name
                              }
                              )
                            </option>
                          ),
                        )}
                      </Select>
                    )}
                  </Field>

                </div>

                <div className="grid gap-5 md:grid-cols-2">

                  <Field
                    label="SKU"
                    placeholder="e.g. BASEUS-65W-BLK"
                    hint="Leave blank to generate automatically."
                    error={
                      errors.sku?.message
                    }
                    {...register('sku')}
                  />

                  <Field
                    label="Barcode"
                    placeholder="Scan or enter barcode"
                    error={
                      errors.barcode
                        ?.message
                    }
                    {...register(
                      'barcode',
                    )}
                  />

                </div>

              </div>
            </Card>

            {/* ===============================================================
               02 PRODUCT CONTENT
               =============================================================== */}

            <Card className="overflow-hidden">

              <div className="border-b border-ink-100 px-5 py-4">
                <SectionHeader
                  icon={Info}
                  title="Product content"
                  description="Content displayed on the storefront."
                />
              </div>

              <div className="space-y-5 p-5">

                <Field
                  label="Short description"
                  hint={
                    (shortDescriptionStyle || 'paragraph') === 'list'
                      ? 'One point per line -- each line becomes a bullet.'
                      : 'A short summary shown near the product title.'
                  }
                  error={
                    errors.short_description
                      ?.message
                  }
                >
                  {({
                    id: fieldId,
                    invalid,
                  }) => (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-ink-500">Display as</span>
                        {[
                          { value: 'paragraph', label: 'Paragraph' },
                          { value: 'list', label: 'Bullet list' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setValue('short_description_style', option.value, { shouldDirty: true })
                            }
                            className={cx(
                              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                              (shortDescriptionStyle || 'paragraph') === option.value
                                ? 'border-brand-500 bg-brand-50 text-brand-700'
                                : 'border-ink-200 text-ink-600 hover:border-ink-300',
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <Textarea
                        id={fieldId}
                        invalid={invalid}
                        rows={
                          (shortDescriptionStyle || 'paragraph') === 'list' ? 5 : 3
                        }
                        placeholder={
                          (shortDescriptionStyle || 'paragraph') === 'list'
                            ? 'Lightweight design\nLong battery life\nWorks with all standard chargers'
                            : 'A short summary shown near the product title.'
                        }
                        {...register(
                          'short_description',
                        )}
                      />
                    </div>
                  )}
                </Field>

                <Field
                  label="Full description"
                  error={
                    errors.description
                      ?.message
                  }
                >
                  {({
                    id: fieldId,
                    invalid,
                  }) => (
                    <Controller
                      name="description"
                      control={control}
                      render={({ field }) => (
                        <RichTextEditor
                          id={fieldId}
                          invalid={invalid}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="Describe the product, features, compatibility and important details..."
                        />
                      )}
                    />
                  )}
                </Field>

              </div>
            </Card>

            {/* ===============================================================
               04 PRICING
               =============================================================== */}

            <Card className="overflow-hidden">

              <div className="border-b border-ink-100 px-5 py-4">
                <SectionHeader
                  icon={Tag}
                  title="Pricing"
                  description={
                    type ===
                    'variable'
                      ? 'Default pricing. Individual variations may override these values.'
                      : 'Set the normal and promotional pricing.'
                  }
                />
              </div>

              <div className="space-y-5 p-5">

                <div className="grid gap-5 md:grid-cols-2">

                  <div className="rounded-2xl border border-ink-200 bg-white p-4">

                    <p className="mb-4 text-sm font-semibold text-ink-900">
                      Regular Price
                    </p>

                    <Field
                      label="Old price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      error={
                        errors.compare_at_price
                          ?.message
                      }
                      {...register(
                        'compare_at_price',
                      )}
                    />

                  </div>

                  <div className="rounded-2xl border border-ink-200 bg-white p-4">

                    <p className="mb-4 text-sm font-semibold text-ink-900">
                      Discount Price
                    </p>

                    <Field
                      label="Selling price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      error={
                        errors.selling_price
                          ?.message
                      }
                      {...register(
                        'selling_price',
                      )}
                    />

                  </div>

                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">

                  <div className="mb-4 flex items-center gap-3">

                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                      <Tag className="h-4 w-4" />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-emerald-900">
                        Promotional offer
                      </p>

                      <p className="text-xs text-emerald-700/70">
                        Optional temporary promotional price.
                      </p>
                    </div>

                  </div>

                  <div className="grid gap-4 md:grid-cols-3">

                    <Field
                      label="Offer price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      error={
                        errors.special_price
                          ?.message
                      }
                      {...register(
                        'special_price',
                      )}
                    />

                    <Field
                      label="Start"
                      type="datetime-local"
                      hint="Blank = immediately."
                      error={
                        errors.special_starts_at
                          ?.message
                      }
                      {...register(
                        'special_starts_at',
                      )}
                    />

                    <Field
                      label="End"
                      type="datetime-local"
                      required={Boolean(
                        specialPrice,
                      )}
                      hint="Required for an offer."
                      error={
                        errors.special_ends_at
                          ?.message
                      }
                      {...register(
                        'special_ends_at',
                      )}
                    />

                  </div>
                </div>

              </div>
            </Card>

            {/* ===============================================================
               05 VARIATIONS
               =============================================================== */}

            {type ===
              'variable' && (
              <Card className="overflow-hidden">

                <div className="border-b border-ink-100 px-5 py-4">
                  <SectionHeader
                    icon={Settings2}
                    title="Variations"
                    description="Define attributes and generate product variations."
                  />
                </div>

                <div className="p-5">

                  <VariationBuilder
                    value={
                      attributes
                    }
                    onChange={
                      setAttributes
                    }
                  />

                </div>
              </Card>
            )}

            {/* ===============================================================
               06 INVENTORY
               =============================================================== */}

            <Card className="overflow-hidden">

              <div className="border-b border-ink-100 px-5 py-4">
                <SectionHeader
                  icon={Package}
                  title="Inventory"
                  description="Stock quantity is synchronized with the inventory ledger."
                />
              </div>

              <div className="space-y-5 p-5">

                {/* Track stock */}

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-ink-200 bg-ink-50/50 p-4">

                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-ink-300"
                    {...register(
                      'is_stock_tracked',
                    )}
                  />

                  <span>
                    <span className="block text-sm font-semibold text-ink-900">
                      Track inventory
                    </span>

                    <span className="mt-1 block text-xs leading-5 text-ink-500">
                      Enable stock tracking for this product.
                      All stock movements are recorded in Inventory.
                    </span>
                  </span>

                </label>

                {/*
                   Stock hangs off a variation, and a variable product has
                   many. One box here could only ever be wrong, so that case
                   is handed to Inventory, which edits each one.
                */}
                {isStockTracked &&
                  type === 'variable' && (
                    <div className="rounded-2xl border border-ink-200 bg-ink-50/50 p-4">
                      <p className="text-sm font-semibold text-ink-900">
                        Stock is held per variation
                      </p>

                      <p className="mt-1 text-xs leading-5 text-ink-500">
                        This product has a stock level for each variation,
                        so it is set in{' '}
                        <span className="font-semibold text-ink-700">
                          Inventory
                        </span>
                        {' '}rather than here.
                      </p>
                    </div>
                  )}

                {isStockTracked &&
                  type === 'simple' && (
                  <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-emerald-50/30">

                    <div className="border-b border-emerald-200 px-4 py-3">

                      <div className="flex items-center gap-2">

                        <Package className="h-4 w-4 text-emerald-700" />

                        <div>
                          <p className="text-sm font-semibold text-emerald-900">
                            Stock quantity
                          </p>

                          <p className="text-[11px] text-emerald-700/70">
                            {isEdit
                              ? `Inventory currently holds ${stockOnRecord}.`
                              : 'Posted to Inventory as opening stock.'}
                          </p>
                        </div>

                      </div>

                    </div>

                    <div className="grid gap-4 p-4 md:grid-cols-2">

                      <Field
                        label={
                          isEdit
                            ? 'Stock on hand'
                            : 'Opening stock'
                        }
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="0"
                        hint={
                          isEdit
                            ? 'The figure you want on hand. Leave blank to leave stock untouched.'
                            : 'Initial stock added to inventory.'
                        }
                        error={
                          errors.stock_quantity
                            ?.message
                        }
                        {...register(
                          'stock_quantity',
                        )}
                      />

                      <Field
                        label="Low stock alert"
                        type="number"
                        step="0.001"
                        min="0"
                        placeholder="5"
                        hint="Warn once stock falls to this level."
                        error={
                          errors.low_stock_threshold
                            ?.message
                        }
                        {...register(
                          'low_stock_threshold',
                        )}
                      />

                      {stockDelta > 0 && (
                        <Field
                          label="Unit cost"
                          type="number"
                          step="0.000001"
                          min="0"
                          placeholder="0.00"
                          hint="What each incoming unit cost you. Blank uses the current average cost."
                          error={
                            errors.stock_unit_cost
                              ?.message
                          }
                          {...register(
                            'stock_unit_cost',
                          )}
                        />
                      )}

                    </div>

                    {stockDelta !== 0 && (
                      <div className="border-t border-emerald-200 bg-white/60 px-4 py-3">

                        <div className="flex items-center justify-between gap-3">

                          <div>
                            <p className="text-xs font-semibold text-ink-800">
                              {!currentStock.hasMovements &&
                              stockDelta > 0
                                ? 'Opening stock will be recorded'
                                : 'Stock movement will be recorded'}
                            </p>

                            <p className="mt-0.5 text-[11px] text-ink-500">
                              Saving posts this movement to the inventory
                              ledger and the accounts.
                            </p>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              stockDelta > 0
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {stockDelta > 0
                              ? '+'
                              : '−'}
                            {Math.abs(
                              stockDelta,
                            )}
                          </span>

                        </div>

                      </div>
                    )}

                  </div>
                )}

              </div>
            </Card>

            {/* ===============================================================
               07 SHIPPING
               =============================================================== */}

            <Card className="overflow-hidden">

              <div className="border-b border-ink-100 px-5 py-4">
                <SectionHeader
                  icon={Package}
                  title="Shipping & warranty"
                  description="Physical dimensions and warranty information."
                />
              </div>

              <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">

                <Field
                  label="Weight (kg)"
                  type="number"
                  step="0.001"
                  min="0"
                  placeholder="0.000"
                  error={
                    errors.weight?.message
                  }
                  {...register(
                    'weight',
                  )}
                />

                <Field
                  label="Length (cm)"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="0"
                  {...register(
                    'length',
                  )}
                />

                <Field
                  label="Width (cm)"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="0"
                  {...register(
                    'width',
                  )}
                />

                <Field
                  label="Height (cm)"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="0"
                  {...register(
                    'height',
                  )}
                />

                <div className="sm:col-span-2 lg:col-span-4">

                  <Field
                    label="Warranty"
                    placeholder="6 months brand warranty"
                    hint="Leave blank if there is no warranty."
                    error={
                      errors.warranty
                        ?.message
                    }
                    {...register(
                      'warranty',
                    )}
                  />

                </div>

              </div>
            </Card>

            {/* ===============================================================
               08 ADDITIONAL INFORMATION
               =============================================================== */}

            <Card className="overflow-hidden">

              <div className="border-b border-ink-100 px-5 py-4">
                <SectionHeader
                  icon={Info}
                  title="Additional information"
                  description="Extra feature and value pairs displayed on the storefront."
                />
              </div>

              <div className="p-5">

                {additionalInfo.length ===
                0 ? (
                  <div className="rounded-xl border border-dashed border-ink-300 bg-ink-50/50 px-5 py-7 text-center">

                    <Info className="mx-auto h-6 w-6 text-ink-400" />

                    <p className="mt-2 text-sm font-medium text-ink-700">
                      No additional information
                    </p>

                    <p className="mt-1 text-xs text-ink-500">
                      Example: Material → Leather
                    </p>

                  </div>
                ) : (
                  <div className="space-y-2">

                    {additionalInfo.map(
                      (
                        row,
                        index,
                      ) => (
                        <div
                          key={
                            row.id ??
                            `info-${index}`
                          }
                          className="grid gap-2 rounded-xl border border-ink-200 bg-ink-50/40 p-2 sm:grid-cols-[220px_minmax(0,1fr)_40px]"
                        >

                          <Input
                            value={
                              row.feature ??
                              ''
                            }
                            placeholder="Feature"
                            onChange={(
                              event,
                            ) =>
                              setAdditionalInfo(
                                (
                                  rows,
                                ) =>
                                  rows.map(
                                    (
                                      item,
                                      i,
                                    ) =>
                                      i ===
                                      index
                                        ? {
                                            ...item,
                                            feature:
                                              event
                                                .target
                                                .value,
                                          }
                                        : item,
                                  ),
                              )
                            }
                          />

                          <Input
                            value={
                              row.description ??
                              ''
                            }
                            placeholder="Description / value"
                            onChange={(
                              event,
                            ) =>
                              setAdditionalInfo(
                                (
                                  rows,
                                ) =>
                                  rows.map(
                                    (
                                      item,
                                      i,
                                    ) =>
                                      i ===
                                      index
                                        ? {
                                            ...item,
                                            description:
                                              event
                                                .target
                                                .value,
                                          }
                                        : item,
                                  ),
                              )
                            }
                          />

                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setAdditionalInfo(
                                (
                                  rows,
                                ) =>
                                  rows.filter(
                                    (
                                      _,
                                      i,
                                    ) =>
                                      i !==
                                      index,
                                  ),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>

                        </div>
                      ),
                    )}

                  </div>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() =>
                    setAdditionalInfo(
                      (rows) => [
                        ...rows,
                        {
                          id:
                            crypto.randomUUID(),
                          feature:
                            '',
                          description:
                            '',
                        },
                      ],
                    )
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add information
                </Button>

              </div>
            </Card>

            {/* ===============================================================
               09 SEO
               =============================================================== */}

            <Card className="overflow-hidden">

              <button
                type="button"
                onClick={() =>
                  setSeoOpen(
                    (value) =>
                      !value,
                  )
                }
                className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-ink-50"
              >

                <div className="grid h-9 w-9 place-items-center rounded-xl bg-ink-100 text-ink-600">
                  <Search className="h-4 w-4" />
                </div>

                <div className="flex-1">

                  <h2 className="text-sm font-semibold text-ink-900">
                    SEO settings
                  </h2>

                  <p className="text-xs text-ink-500">
                    Search engine title and description.
                  </p>

                </div>

                {seoOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}

              </button>

              {seoOpen && (
                <div className="space-y-4 border-t border-ink-100 p-5">

                  <Field
                    label="Meta title"
                    hint="Maximum 160 characters."
                    error={
                      errors.meta_title
                        ?.message
                    }
                    {...register(
                      'meta_title',
                    )}
                  />

                  <Field
                    label="Meta description"
                    error={
                      errors.meta_description
                        ?.message
                    }
                  >
                    {({
                      id: fieldId,
                    }) => (
                      <Textarea
                        id={fieldId}
                        rows={4}
                        placeholder="Write a concise search engine description..."
                        {...register(
                          'meta_description',
                        )}
                      />
                    )}
                  </Field>

                </div>
              )}

            </Card>

          </div>

          {/* =================================================================
             SIDEBAR
             ================================================================= */}

          <aside className="space-y-5 xl:sticky xl:top-[78px]">

            {/* ===============================================================
               PUBLISHING
               =============================================================== */}

            <SidebarSection
              icon={ShieldCheck}
              title="Publishing"
              description="Visibility and storefront status."
            >

              <div className="space-y-4">

                <Field
                  label="Status"
                  required
                  error={
                    errors.status
                      ?.message
                  }
                >
                  {({
                    id: fieldId,
                  }) => (
                    <Select
                      id={fieldId}
                      {...register(
                        'status',
                      )}
                    >
                      <option value="draft">
                        Draft — hidden
                      </option>

                      <option value="active">
                        Active — on sale
                      </option>

                      <option value="archived">
                        Archived — withdrawn
                      </option>
                    </Select>
                  )}
                </Field>

                <Field
                  label="Publish date"
                  type="datetime-local"
                  hint="Blank = publish immediately when active."
                  error={
                    errors.published_at
                      ?.message
                  }
                  {...register(
                    'published_at',
                  )}
                />

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink-200 p-3">

                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-ink-300"
                    {...register(
                      'is_featured',
                    )}
                  />

                  <span>
                    <span className="block text-sm font-medium text-ink-800">
                      Featured product
                    </span>

                    <span className="mt-0.5 block text-[11px] text-ink-500">
                      Highlight this product on the homepage.
                    </span>
                  </span>

                </label>

              </div>

            </SidebarSection>

            {/* ===============================================================
               PRODUCT IMAGES
               =============================================================== */}

            <SidebarSection
              icon={ImageIcon}
              title="Product images"
              description="The first image will be used as the primary product image."
            >

              <ProductImages
                productId={
                  isEdit
                    ? id
                    : null
                }
                value={images}
                onChange={
                  setImages
                }
              />

            </SidebarSection>

            {/* ===============================================================
               SUMMARY
               =============================================================== */}

            <div className="overflow-hidden rounded-2xl bg-ink-950 text-white shadow-sm">

              <div className="border-b border-white/10 px-4 py-3.5">

                <div className="flex items-center gap-2">

                  <ShoppingBag className="h-4 w-4" />

                  <p className="text-sm font-semibold">
                    Product summary
                  </p>

                </div>

              </div>

              <div className="space-y-3 px-4 py-4">

                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">
                    Type
                  </span>

                  <span className="font-medium">
                    {type ===
                    'variable'
                      ? 'Variable'
                      : 'Simple'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">
                    Status
                  </span>

                  <span className="font-medium capitalize">
                    {status}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">
                    Images
                  </span>

                  <span className="font-medium">
                    {images.length}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-white/50">
                    Stock
                  </span>

                  <span className="font-medium">
                    {!isStockTracked
                      ? 'Not tracked'
                      : type === 'variable'
                        ? 'Per variation'
                        : stockQuantity === ''
                          ? 'Unchanged'
                          : Number(
                              stockQuantity,
                            ).toLocaleString()}
                  </span>
                </div>

                {type ===
                  'variable' && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/50">
                      Attributes
                    </span>

                    <span className="font-medium">
                      {
                        Object.keys(
                          attributes,
                        ).length
                      }
                    </span>
                  </div>
                )}

              </div>
            </div>

          </aside>
        </div>
      </div>
    </form>
  )
}