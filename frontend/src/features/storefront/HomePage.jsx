import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronRight, PackageOpen, ShieldCheck, SlidersHorizontal, Truck } from 'lucide-react'
import { get } from '../../lib/api'
import { cx } from '../../lib/format'
import { EmptyState } from '../../components/ui'
import { ProductCard, ProductCardSkeleton } from './ProductCard'

/*
 * Promotional slides.
 *
 * Drawn in CSS rather than loaded as artwork: there is no banner module yet,
 * and shipping a hardcoded <img> of a sale that is not running would be a lie
 * on the shop's most prominent surface. When banners are built this reads
 * from the API instead.
 */
const SLIDES = [
  {
    eyebrow: 'Shopping fest',
    title: 'Electronics\nfor everyone',
    body: 'Audio, charging, and computer accessories stocked in Dhaka.',
    cta: 'Shop now',
    from: 'from-brand-600',
    to: 'to-brand-900',
  },
  {
    eyebrow: 'Cash on delivery',
    title: 'Pay when it\narrives',
    body: 'No advance payment. Check the product, then hand over the cash.',
    cta: 'Browse products',
    from: 'from-brand-700',
    to: 'to-navy-900',
  },
  {
    eyebrow: 'Genuine products',
    title: 'Genuine stock,\nwith warranty',
    body: 'Every item comes from the brand or its authorised distributor.',
    cta: 'See the range',
    from: 'from-navy-800',
    to: 'to-brand-800',
  },
]

function HeroCarousel() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    // Respect a reduced-motion preference: no auto-advance for anyone who
    // asked the OS to stop things moving on their own.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced) return

    const timer = setInterval(() => setIndex((current) => (current + 1) % SLIDES.length), 6000)

    return () => clearInterval(timer)
  }, [])

  const slide = SLIDES[index]

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Promotions"
      className={cx(
        'relative flex min-h-64 flex-col justify-center overflow-hidden rounded-lg bg-gradient-to-br p-6 text-white sm:min-h-[19rem] sm:p-10 lg:h-[19rem]',
        slide.from,
        slide.to,
      )}
    >
      {/* Dot grid, echoing the sample's banner texture. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.13]"
        style={{
          backgroundImage: 'radial-gradient(currentColor 1.5px, transparent 1.5px)',
          backgroundSize: '22px 22px',
        }}
      />

      <div className="relative max-w-lg">
        <p className="text-sm font-semibold uppercase tracking-wider text-white/75">{slide.eyebrow}</p>
        <h1 className="mt-2 whitespace-pre-line text-3xl font-bold leading-tight sm:text-4xl">
          {slide.title}
        </h1>
        <p className="mt-3 text-white/85">{slide.body}</p>

        <Link
          to="/products"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50"
        >
          {slide.cta}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5">
        {SLIDES.map((item, i) => (
          <button
            key={item.eyebrow}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show slide ${i + 1}`}
            aria-current={i === index}
            className={cx(
              'h-1.5 rounded-full transition-all',
              i === index ? 'w-7 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75',
            )}
          />
        ))}
      </div>
    </section>
  )
}

function CategorySidebar() {
  const query = useQuery({
    queryKey: ['shop', 'categories'],
    queryFn: () => get('/shop/categories'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })

  const categories = query.data ?? []

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-ink-200 bg-white lg:flex lg:h-[19rem]">
      <h2 className="flex shrink-0 items-center gap-2 bg-brand-600 px-4 py-3.5 font-semibold text-white">
        <SlidersHorizontal className="h-4.5 w-4.5" aria-hidden="true" />
        All Categories
      </h2>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isLoading ? (
          <ul className="divide-y divide-ink-100">
            {Array.from({ length: 7 }).map((_, index) => (
              <li key={index} className="flex items-center gap-3 p-2.5">
                <span className="h-10 w-10 animate-pulse rounded bg-ink-100" />
                <span className="h-3.5 w-24 animate-pulse rounded bg-ink-100" />
              </li>
            ))}
          </ul>
        ) : categories.length === 0 ? (
          <p className="p-4 text-sm text-ink-500">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  to={`/products?category=${category.slug}`}
                  className="group flex items-center gap-3 p-2.5 transition-colors hover:bg-brand-50"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded bg-ink-100 text-sm font-bold text-ink-500">
                    {category.image ? (
                      <img src={category.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      category.name.charAt(0)
                    )}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800 group-hover:text-brand-700">
                    {category.name}
                  </span>

                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-ink-400 group-hover:text-brand-600"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

function CategorySection({ section }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold uppercase tracking-wide text-ink-900">{section.name}</h2>

        <Link
          to={`/products?category=${section.slug}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          See More
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {section.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}

const PROMISES = [
  { icon: Truck, title: 'Cash on delivery', body: 'Pay when your order reaches your door.' },
  { icon: ShieldCheck, title: 'Genuine with warranty', body: 'Straight from the brand or its distributor.' },
  { icon: PackageOpen, title: 'Easy returns', body: 'Something wrong? Send it back.' },
]

export function HomePage() {
  const sections = useQuery({
    queryKey: ['shop', 'home-sections'],
    queryFn: () => get('/shop/categories/featured', { params: { per_category: 5, limit: 4 } }),
    select: (response) => response.data,
  })

  const latest = useQuery({
    queryKey: ['shop', 'products', { home: true }],
    queryFn: () => get('/shop/products', { params: { per_page: 10 } }),
  })

  const hasSections = (sections.data ?? []).length > 0

  return (
    <div>
      <div className="flex gap-4">
        <CategorySidebar />

        <div className="min-w-0 flex-1">
          <HeroCarousel />
        </div>
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        {PROMISES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3 rounded-lg border border-ink-200 bg-white p-3.5">
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

      {sections.isLoading || latest.isLoading ? (
        <section className="mt-8">
          <div className="mb-3 h-6 w-32 animate-pulse rounded bg-ink-200" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        </section>
      ) : hasSections ? (
        sections.data.map((section) => <CategorySection key={section.id} section={section} />)
      ) : (latest.data?.data ?? []).length > 0 ? (
        <CategorySection
          section={{ id: 'latest', name: 'Latest products', slug: '', products: latest.data.data }}
        />
      ) : (
        <div className="mt-8 rounded-lg border border-ink-200 bg-white">
          <EmptyState
            title="No products yet"
            description="Once products are published they will appear here, grouped by category."
          />
        </div>
      )}
    </div>
  )
}
