import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { ChevronRight, ImageOff, ShieldCheck, Truck } from 'lucide-react'
import { get } from '../../lib/api'
import { cx, money } from '../../lib/format'
import { Badge, Button, ErrorState, PageLoader } from '../../components/ui'

export function ProductDetailPage() {
  const { slug } = useParams()
  const [activeImage, setActiveImage] = useState(0)
  const [variationId, setVariationId] = useState(null)

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

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-ink-500">
        <Link to="/" className="hover:text-ink-900">Home</Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <Link to="/products" className="hover:text-ink-900">Products</Link>
        {product.category?.name && (
          <>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="text-ink-700">{product.category.name}</span>
          </>
        )}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="aspect-square overflow-hidden rounded-card border border-ink-200 bg-white">
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

        <div className="flex flex-col gap-5">
          <div>
            {product.brand?.name && (
              <p className="text-sm uppercase tracking-wide text-ink-400">{product.brand.name}</p>
            )}
            <h1 className="mt-1 text-2xl font-semibold text-ink-900">{product.name}</h1>
            {product.short_description && (
              <p className="mt-2 text-ink-600">{product.short_description}</p>
            )}
          </div>

          <div className="flex items-baseline gap-3">
            <span className="tabular text-3xl font-semibold text-accent-700">{money(price)}</span>
            {wasPrice && Number(wasPrice) > Number(price) && (
              <>
                <span className="tabular text-lg text-ink-400 line-through">{money(wasPrice)}</span>
                <Badge tone="accent">Sale</Badge>
              </>
            )}
          </div>

          {variations.length > 1 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-ink-800">Choose an option</legend>
              <div className="flex flex-wrap gap-2">
                {variations.map((variation) => (
                  <button
                    key={variation.id}
                    type="button"
                    onClick={() => setVariationId(variation.id)}
                    aria-pressed={variation.id === selected?.id}
                    className={cx(
                      'rounded-lg border px-3 py-2 text-sm transition-colors',
                      variation.id === selected?.id
                        ? 'border-brand-600 bg-brand-50 font-medium text-brand-800'
                        : 'border-ink-300 text-ink-700 hover:border-ink-400',
                    )}
                  >
                    {variation.name || variation.sku}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

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

          {/*
            Checkout arrives with the orders module. Showing a dead "Add to
            cart" button would be worse than saying so plainly.
          */}
          <div className="rounded-card border border-dashed border-ink-300 bg-ink-50 p-4">
            <p className="text-sm font-medium text-ink-800">Ordering opens soon</p>
            <p className="mt-1 text-sm text-ink-500">
              The cart and checkout are being built. Everything you see here is live data from the
              catalogue.
            </p>
            <Button variant="secondary" size="sm" className="mt-3" disabled>
              Add to cart
            </Button>
          </div>

          <div className="flex flex-col gap-2 text-sm text-ink-600">
            <p className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Cash on delivery available
            </p>
            <p className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-brand-600" aria-hidden="true" />
              Genuine product guarantee
            </p>
          </div>
        </div>
      </div>

      {product.description && (
        <section className="max-w-3xl">
          <h2 className="text-lg font-semibold text-ink-900">Description</h2>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-700">{product.description}</p>
        </section>
      )}

      {product.specifications && Object.keys(product.specifications).length > 0 && (
        <section className="max-w-3xl">
          <h2 className="text-lg font-semibold text-ink-900">Specifications</h2>
          <dl className="mt-3 divide-y divide-ink-100 rounded-card border border-ink-200 bg-white">
            {Object.entries(product.specifications).map(([name, values]) => (
              <div key={name} className="grid grid-cols-3 gap-4 px-4 py-2.5 text-sm">
                <dt className="text-ink-500">{name}</dt>
                <dd className="col-span-2 text-ink-800">
                  {Array.isArray(values) ? values.join(', ') : String(values)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}
