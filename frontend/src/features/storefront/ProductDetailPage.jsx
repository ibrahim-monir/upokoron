import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageOff,
  Minus,
  PackageOpen,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Star,
  Truck,
} from 'lucide-react'
import { get } from '../../lib/api'
import { cx, money } from '../../lib/format'
import { Button, ErrorState, PageLoader, useToast } from '../../components/ui'
import { FacebookIcon, WhatsAppIcon, XIcon } from '../../components/BrandIcons'
import { useAddToCart } from '../cart/useCart'
import { ProductCard, ProductCardSkeleton } from './ProductCard'

// Same claims HomePage makes, not new ones -- a product page inventing its
// own "24/7 support" or "free shipping" would contradict whatever this shop
// actually promises everywhere else.
const TRUST = [
  { icon: Truck, title: 'Cash on delivery', body: 'Pay when your order reaches your door.' },
  { icon: ShieldCheck, title: 'Genuine with warranty', body: 'Straight from the brand or its distributor.' },
  { icon: PackageOpen, title: 'Easy returns', body: 'Something wrong? Send it back.' },
]

const TABS = [
  { key: 'description', label: 'Description' },
  { key: 'additional', label: 'Additional Information' },
  { key: 'review', label: 'Review' },
]

function StarRating({ value, count }) {
  const rating = Number(value ?? 0)

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <div className="flex">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={i < Math.round(rating) ? 'h-4 w-4 fill-amber-400 text-amber-400' : 'h-4 w-4 text-ink-300'}
            aria-hidden="true"
          />
        ))}
      </div>
      <span className="tabular text-ink-600">
        {rating.toFixed(1)} ({count ?? 0} review{count === 1 ? '' : 's'})
      </span>
    </div>
  )
}

/** Real related products -- same category, current one excluded. Nothing shown if there is no category or nothing else in it. */
function RelatedProducts({ categorySlug, excludeId }) {
  const query = useQuery({
    queryKey: ['shop', 'products', 'related', categorySlug],
    queryFn: () => get('/shop/products', { params: { category: categorySlug, per_page: 5 } }),
    enabled: Boolean(categorySlug),
    select: (response) => response.data,
  })

  if (!categorySlug) return null

  const products = (query.data ?? []).filter((product) => product.id !== excludeId).slice(0, 4)

  if (query.isSuccess && products.length === 0) return null

  return (
    <section>
      <h2 className="text-center text-xl font-bold text-ink-900">Explore Related Products</h2>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {query.isLoading
          ? Array.from({ length: 4 }).map((_, index) => <ProductCardSkeleton key={index} />)
          : products.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
  )
}

export function ProductDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const addToCart = useAddToCart()

  const [activeImage, setActiveImage] = useState(0)
  const [variationId, setVariationId] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [tab, setTab] = useState('description')

  const query = useQuery({
    queryKey: ['shop', 'product', slug],
    queryFn: () => get(`/shop/products/${slug}`),
    select: (response) => response.data,
  })

  if (query.isLoading) return <PageLoader label="Loading product" />

  if (query.isError) {
    return (
      <div className="mx-auto max-w-lg">
        <ErrorState error={query.error} onRetry={query.refetch} />
        <Link to="/products" className="mt-4 inline-block text-sm text-brand-700 underline">
          Back to all products
        </Link>
      </div>
    )
  }

  const product = query.data
  const variations = product.variations ?? []
  const selected = variations.find((v) => v.id === variationId) ?? product.default_variation ?? variations[0]
  const images = product.images ?? []
  const price = selected?.effective_price ?? selected?.selling_price
  const wasPrice = selected?.is_on_sale ? selected.selling_price : selected?.compare_at_price
  const hasDiscount = wasPrice != null && Number(wasPrice) > Number(price)
  const discountPercent = hasDiscount ? Math.round((1 - Number(price) / Number(wasPrice)) * 100) : null

  const available = Number(selected?.available_quantity ?? 0)
  const inStock = available > 0
  const canBuy = Boolean(selected) && inStock && !addToCart.isPending

  const addItem = (onDone) => {
    if (!selected) return

    addToCart.mutate(
      { variationId: selected.id, quantity },
      {
        onSuccess: onDone,
        onError(error) {
          toast.error(error?.message ?? 'Could not add that to your cart.')
        },
      },
    )
  }

  const pageUrl = typeof window !== 'undefined' ? window.location.href : ''
  const shareLinks = [
    {
      label: 'Share on Facebook',
      icon: FacebookIcon,
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`,
    },
    {
      label: 'Share on WhatsApp',
      icon: WhatsAppIcon,
      href: `https://wa.me/?text=${encodeURIComponent(`${product.name} ${pageUrl}`)}`,
    },
    {
      label: 'Share on X',
      icon: XIcon,
      href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(product.name)}`,
    },
  ]

  // Feature/Description rows for the Additional Information tab. The
  // owner's own rows come first since they're deliberately written for this
  // product; weight, dimensions, and brand follow, then anything from the
  // attribute system.
  const additionalInfo = [
    ...(product.additional_info ?? []).map((row) => [row.feature, row.description]),
    ...(product.weight ? [['Item Weight', `${product.weight} kg`]] : []),
    ...(product.dimensions
      ? [[
          'Dimensions',
          `${product.dimensions.length ?? '—'}L x ${product.dimensions.width ?? '—'}W x ${product.dimensions.height ?? '—'}H cm`,
        ]]
      : []),
    ...(product.brand?.name ? [['Brand', product.brand.name]] : []),
    ...Object.entries(product.specifications ?? {}).map(([name, values]) => [
      name,
      Array.isArray(values) ? values.join(', ') : String(values),
    ]),
  ]

  return (
    <div className="flex flex-col gap-10">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-ink-500">
        <Link to="/" className="hover:text-ink-900">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <Link to="/products" className="hover:text-ink-900">Products</Link>
        {product.category?.name && (
          <>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <Link to={`/category/${product.category.slug}`} className="hover:text-ink-900">
              {product.category.name}
            </Link>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* ------------------------------------------------------- gallery */}
        <div className="flex flex-col gap-3">
          <div className="relative aspect-square overflow-hidden rounded-card border border-ink-200 bg-white">
            {hasDiscount && (
              <span className="absolute left-3 top-3 z-10 rounded-full bg-success-600 px-2.5 py-1 text-xs font-semibold text-white">
                −{discountPercent}%
              </span>
            )}

            {images[activeImage] ? (
              <img
                src={images[activeImage].url}
                alt={images[activeImage].alt ?? product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full place-items-center text-ink-300">
                <ImageOff className="h-10 w-10" aria-hidden="true" />
              </div>
            )}

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setActiveImage((i) => (i - 1 + images.length) % images.length)}
                  aria-label="Previous image"
                  className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink-700 shadow-card hover:bg-white"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveImage((i) => (i + 1) % images.length)}
                  aria-label="Next image"
                  className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-ink-700 shadow-card hover:bg-white"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setActiveImage(index)}
                  aria-label={`View image ${index + 1}`}
                  aria-current={index === activeImage}
                  className={cx(
                    'h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2',
                    index === activeImage ? 'border-brand-600' : 'border-ink-200',
                  )}
                >
                  <img src={image.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* --------------------------------------------------------- info */}
        <div className="flex flex-col gap-4">
          <div>
            {product.category?.name && (
              <p className="text-sm uppercase tracking-wide text-ink-400">{product.category.name}</p>
            )}
            <h1 className="mt-1 text-2xl font-semibold text-ink-900">{product.name}</h1>
          </div>

          <StarRating value={product.rating_avg} count={product.rating_count} />

          <div className="flex items-baseline gap-3">
            <span className="tabular text-3xl font-bold text-brand-600">{money(price)}</span>
            {hasDiscount && <span className="tabular text-lg text-ink-400 line-through">{money(wasPrice)}</span>}
          </div>

          {product.short_description && <p className="text-ink-600">{product.short_description}</p>}

          {variations.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink-800">
                {variations.some((v) => v.attributes?.some((a) => a.color_hex)) ? 'Colour' : 'Choose an option'}
              </legend>
              <div className="flex flex-wrap items-center gap-2">
                {variations.map((variation) => {
                  const colorAttr = variation.attributes?.find((a) => a.color_hex)
                  const isSelected = variation.id === selected?.id

                  if (colorAttr) {
                    return (
                      <button
                        key={variation.id}
                        type="button"
                        onClick={() => setVariationId(variation.id)}
                        aria-pressed={isSelected}
                        title={colorAttr.value}
                        style={{ backgroundColor: colorAttr.color_hex }}
                        className={cx(
                          'h-8 w-8 rounded-full ring-2 ring-offset-2 transition-shadow',
                          isSelected ? 'ring-brand-600' : 'ring-transparent hover:ring-ink-300',
                        )}
                      />
                    )
                  }

                  return (
                    <button
                      key={variation.id}
                      type="button"
                      onClick={() => setVariationId(variation.id)}
                      aria-pressed={isSelected}
                      className={cx(
                        'rounded-lg border px-3 py-2 text-sm transition-colors',
                        isSelected
                          ? 'border-brand-600 bg-brand-50 font-medium text-brand-800'
                          : 'border-ink-300 text-ink-700 hover:border-ink-400',
                      )}
                    >
                      {variation.name || variation.sku}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}

          {inStock ? (
            available <= 5 && <p className="text-sm text-ink-500">Only {available} left</p>
          ) : (
            <p className="text-sm font-semibold text-danger-700">Out of stock</p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-lg border border-ink-200">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1 || !inStock}
                aria-label="Reduce quantity"
                className="grid h-11 w-11 place-items-center rounded-l-lg text-ink-600 enabled:hover:bg-ink-50 disabled:opacity-40"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>

              <span className="tabular w-12 text-center font-semibold text-ink-900">{quantity}</span>

              <button
                type="button"
                onClick={() => setQuantity((q) => Math.min(available, q + 1))}
                disabled={quantity >= available || !inStock}
                aria-label="Increase quantity"
                className="grid h-11 w-11 place-items-center rounded-r-lg text-ink-600 enabled:hover:bg-ink-50 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <Button
              variant="secondary"
              size="lg"
              onClick={() => addItem(() => toast.success('Added to cart.'))}
              disabled={!canBuy}
              loading={addToCart.isPending}
            >
              <ShoppingCart className="h-4 w-4" aria-hidden="true" />
              Add To Cart
            </Button>

            <Button
              variant="accent"
              size="lg"
              onClick={() => addItem(() => navigate('/checkout'))}
              disabled={!canBuy}
              loading={addToCart.isPending}
            >
              Buy Now
            </Button>

            <button
              type="button"
              aria-label={`Save ${product.name} to your wishlist`}
              title="Wishlist arrives with the customer accounts module"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-ink-200 text-ink-500 hover:border-danger-300 hover:text-danger-600"
            >
              <Heart className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y border-ink-200 py-4 text-sm">
            <dt className="text-ink-500">SKU</dt>
            <dd className="tabular text-ink-800">{selected?.sku ?? '—'}</dd>

            {product.unit?.name && (
              <>
                <dt className="text-ink-500">Sold by</dt>
                <dd className="text-ink-800">{product.unit.name}</dd>
              </>
            )}

            {product.warranty && (
              <>
                <dt className="text-ink-500">Warranty</dt>
                <dd className="text-ink-800">{product.warranty}</dd>
              </>
            )}
          </dl>

          {(product.category?.name || product.brand?.name) && (
            <p className="text-sm text-ink-600">
              {product.category?.name && (
                <>
                  Category:{' '}
                  <Link to={`/category/${product.category.slug}`} className="text-brand-700 hover:underline">
                    {product.category.name}
                  </Link>
                </>
              )}
              {product.category?.name && product.brand?.name && ' · '}
              {product.brand?.name && <>Brand: {product.brand.name}</>}
            </p>
          )}

          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-500">Share:</span>
            {shareLinks.map(({ label, icon: Icon, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                aria-label={label}
                className="grid h-8 w-8 place-items-center rounded-full bg-ink-100 text-ink-600 hover:bg-brand-100 hover:text-brand-700"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------ tabs */}
      <div>
        <div className="flex gap-6 border-b border-ink-200" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cx(
                '-mb-px border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
                tab === item.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-ink-500 hover:text-ink-800',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="max-w-3xl py-5">
          {tab === 'description' && (
            <p className="whitespace-pre-line leading-relaxed text-ink-700">
              {product.description || 'No description has been written for this product yet.'}
            </p>
          )}

          {tab === 'additional' &&
            (additionalInfo.length > 0 ? (
              <div className="overflow-hidden rounded-card border border-ink-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-brand-600 text-left text-white">
                      <th scope="col" className="px-4 py-2.5 font-semibold">Feature</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {additionalInfo.map(([name, value], index) => (
                      <tr key={name} className={index % 2 === 1 ? 'bg-ink-50' : 'bg-white'}>
                        <td className="px-4 py-2.5 text-ink-600">{name}</td>
                        <td className="px-4 py-2.5 text-ink-900">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ink-500">No additional information for this product.</p>
            ))}

          {tab === 'review' &&
            (Number(product.rating_count) > 0 ? (
              <div className="flex items-center gap-3">
                <StarRating value={product.rating_avg} count={product.rating_count} />
              </div>
            ) : (
              <p className="text-sm text-ink-500">No reviews yet.</p>
            ))}
        </div>
      </div>

      <RelatedProducts categorySlug={product.category?.slug} excludeId={product.id} />

      <section className="grid gap-3 border-t border-ink-200 pt-6 sm:grid-cols-3">
        {TRUST.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-900">{title}</p>
              <p className="mt-0.5 text-sm text-ink-500">{body}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
