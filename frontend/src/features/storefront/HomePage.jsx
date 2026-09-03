import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronRight, Flame, SlidersHorizontal } from 'lucide-react'
import { get } from '../../lib/api'
import { cx } from '../../lib/format'
import { useTranslation } from '../../lib/i18n'
import { EmptyState } from '../../components/ui'
import { PRODUCT_GRID, ProductCard, ProductCardSkeleton } from './ProductCard'
import { RailArrows, useRail } from './Rail'

/*
 * Colour themes a banner may be saved with (Admin -> Marketing -> Home page
 * banners). Written out literally rather than built from the key, because
 * Tailwind's JIT compiler only generates CSS for class names it can find as
 * plain text in source -- a `from-${theme}-600` built at runtime would
 * resolve to nothing.
 */
const THEMES = {
  brand: { from: 'from-brand-600', to: 'to-brand-900' },
  navy: { from: 'from-brand-700', to: 'to-navy-900' },
  contrast: { from: 'from-navy-800', to: 'to-brand-800' },
}

function useStoreSettingsForHero() {
  return useQuery({
    queryKey: ['shop', 'settings'],
    queryFn: () => get('/shop/settings'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })
}

function HeroCarousel() {
  const { t } = useTranslation()
  const [index, setIndex] = useState(0)

  const banners = useQuery({
    queryKey: ['shop', 'banners'],
    queryFn: () => get('/shop/banners'),
    select: (response) => response.data,
  })

  /*
   * A slide is a picture and a link, and nothing else. There is no headline
   * to write in the admin panel any more: the artwork is made somewhere it
   * can carry its own words, laid out where the picture has room for them,
   * rather than having a second headline dropped on top of it here.
   *
   * Which is also why a banner with no picture is skipped rather than shown
   * empty -- with the overlay gone there would be nothing on it at all.
   */
  const slides = (banners.data ?? []).filter((banner) => Boolean(banner.image))

  useEffect(() => {
    // Respect a reduced-motion preference: no auto-advance for anyone who
    // asked the OS to stop things moving on their own.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced || slides.length <= 1) return

    const timer = setInterval(() => setIndex((current) => (current + 1) % slides.length), 6000)

    return () => clearInterval(timer)
  }, [slides.length])

  if (banners.isLoading) {
    return (
      <div className="min-h-64 animate-pulse rounded-lg bg-ink-100 sm:min-h-[25rem] lg:h-[25rem]" />
    )
  }

  // Nothing configured yet. A plain panel holds the row's height so the
  // category list beside it does not jump up the page on a new install.
  if (slides.length === 0) {
    return (
      <div
        aria-hidden="true"
        className={cx(
          'min-h-64 rounded-lg bg-gradient-to-br sm:min-h-[25rem] lg:h-[25rem]',
          THEMES.brand.from,
          THEMES.brand.to,
        )}
      />
    )
  }

  // The list can shrink (a banner deleted, or one just expired) while a
  // stale index from a longer list is still selected.
  const slide = slides[index] ?? slides[0]
  const theme = THEMES[slide.theme] ?? THEMES.brand

  return (
    <section
      aria-roledescription="carousel"
      aria-label={t('home.promotions')}
      className={cx(
        'relative min-h-64 overflow-hidden rounded-lg bg-gradient-to-br sm:min-h-[25rem] lg:h-[25rem]',
        theme.from,
        theme.to,
      )}
    >
      {/*
        The whole slide is the link. With no button left on it, anything
        smaller would be a picture that looks clickable everywhere and only
        works in one place.
      */}
      <Link
        to={slide.link ?? '/products'}
        aria-label={t('home.viewPromotion')}
        // Absolute, not h-full: the section's height comes from min-h plus a
        // fixed height at lg, and a percentage height inside a box that is
        // only min-height on phones resolves to auto -- which is a link the
        // size of nothing.
        className="absolute inset-0"
      >
        <img
          src={slide.image}
          alt=""
          className="h-full w-full object-cover"
          /* The first slide is the page's largest image and sits at the very
             top, so it is the one measurement that decides how quickly the
             home page looks loaded. */
          loading={index === 0 ? 'eager' : 'lazy'}
        />
      </Link>

      {slides.length > 1 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t('home.showSlide', { n: i + 1 })}
              aria-current={i === index}
              className={cx(
                'h-1.5 rounded-full shadow-card transition-all',
                i === index ? 'w-7 bg-white' : 'w-1.5 bg-white/60 hover:bg-white/85',
              )}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CategorySidebar() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['shop', 'categories'],
    queryFn: () => get('/shop/categories'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })

  const categories = query.data ?? []

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-hidden rounded-lg border border-ink-200 bg-white lg:flex lg:h-[25rem]">
      <h2 className="flex shrink-0 items-center gap-2 bg-brand-600 px-4 py-3.5 font-semibold text-white">
        <SlidersHorizontal className="h-4.5 w-4.5" aria-hidden="true" />
        {t('header.allCategories')}
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
          <p className="p-4 text-sm text-ink-500">{t('home.noCategoriesYet')}</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {categories.map((category) => (
              <li key={category.id}>
                <Link
                  to={`/category/${category.slug}`}
                  className="group flex items-center gap-3 p-2.5 transition-colors hover:bg-brand-50"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded bg-ink-100 text-sm font-bold text-ink-500">
                    {category.image ? (
                      <img src={category.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      category.name.charAt(0)
                    )}
                  </span>

                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800 group-hover:text-brand-800">
                    {category.name}
                  </span>

                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-ink-400 group-hover:text-brand-800"
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
  const { t } = useTranslation()

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold uppercase tracking-wide text-ink-900">{section.name}</h2>

        <Link
          // The "Latest products" fallback section has no real category
          // (slug ''), so it points at the plain listing instead of a
          // /category/ URL an empty slug could never match.
          to={section.slug ? `/category/${section.slug}` : '/products'}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          {t('home.seeMore')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className={PRODUCT_GRID}>
        {section.products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}

function CategoryStrip() {
  const { t } = useTranslation()
  const settings = useStoreSettingsForHero()

  const categories = useQuery({
    queryKey: ['shop', 'categories'],
    queryFn: () => get('/shop/categories'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })

  const list = categories.data ?? []
  const rail = useRail(list.length, { autoAdvanceMs: 3000 })

  const style = settings.data?.home_categories_style ?? 'circle'
  const title = settings.data?.home_categories_title ?? t('home.shopByCategory')
  const enabled = settings.data?.home_categories_enabled !== false

  if (!enabled || (categories.isLoading === false && list.length === 0)) return null

  return (
    <section className="mt-4">
      <h2 className="mb-3 text-center text-lg font-bold uppercase tracking-wide text-ink-900">{title}</h2>

      {/* Positioned parent for the overlaid arrows. */}
      <div className="relative">
        <RailArrows rail={rail} label="categories" />

        <div ref={rail.ref} className="rail flex snap-x snap-mandatory gap-3 scroll-smooth pb-1">
          {list.map((category) => (
            <CategoryChip key={category.id} category={category} style={style} />
          ))}
        </div>
      </div>
    </section>
  )
}

/** One category, drawn the way the store's settings ask for. */
function CategoryChip({ category, style }) {
  const { t } = useTranslation()
  const to = `/category/${category.slug}`
  const count = category.product_count ?? 0

  if (style === 'tile') {
    return (
      <Link
        to={to}
        className="group flex shrink-0 snap-start items-center gap-2.5 rounded-lg border border-ink-200 bg-white px-4 py-3 transition hover:border-brand-600 hover:shadow-card"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-50 text-xs font-bold text-brand-800">
          {category.name.charAt(0)}
        </span>

        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-ink-900 group-hover:text-brand-800">
            {category.name}
          </span>
          {count > 0 && <span className="block text-[11px] text-ink-500">{t('home.itemsCount', { count })}</span>}
        </span>
      </Link>
    )
  }

  if (style === 'card') {
    return (
      <Link
        to={to}
        className="group w-[9.5rem] shrink-0 snap-start overflow-hidden rounded-lg border border-ink-200 bg-white transition hover:border-brand-600 hover:shadow-card"
      >
        <span className="block aspect-[4/3] overflow-hidden bg-ink-100">
          {category.image ? (
            <img
              src={category.image}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <span className="grid h-full w-full place-items-center text-xl font-black text-ink-300">
              {category.name.charAt(0)}
            </span>
          )}
        </span>

        <span className="block px-3 py-2.5">
          <span className="block truncate text-sm font-semibold text-ink-900 group-hover:text-brand-800">
            {category.name}
          </span>
          {count > 0 && <span className="mt-0.5 block text-[11px] text-ink-500">{t('home.itemsCount', { count })}</span>}
        </span>
      </Link>
    )
  }

  return (
    <Link to={to} className="group w-[170px] shrink-0 snap-start text-center">
      <span className="mx-auto grid aspect-square w-full place-items-center overflow-hidden rounded-full border border-ink-200 bg-white transition group-hover:border-brand-600 group-hover:shadow-card">
        {category.image ? (
          <img src={category.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="text-3xl font-black text-brand-800">{category.name.charAt(0)}</span>
        )}
      </span>

      <span className="mt-2.5 block truncate text-sm font-medium text-ink-800 group-hover:text-brand-800">
        {category.name}
      </span>
    </Link>
  )
}

/**
 * What is actually selling, ranked by order lines in a recent window.
 *
 * The server does the ranking (see ProductController::trending) because
 * "trending" is a question about orders, and the storefront is never shown
 * order data.
 */
export function TrendingSection() {
  const { t } = useTranslation()
  const settings = useStoreSettingsForHero()

  const days = Number(settings.data?.home_trending_days ?? 30)
  const enabled = settings.data?.home_trending_enabled !== false
  const title = settings.data?.home_trending_title ?? t('home.trendingRightNow')

  const query = useQuery({
    queryKey: ['shop', 'trending', days],
    // More than fits on one row, so there is something to slide to. The row
    // is the point: a wrapping grid buries the ranking, because the tenth
    // most popular product ends up as visually prominent as the first.
    queryFn: () => get('/shop/products/trending', { params: { limit: 20, days } }),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const products = query.data?.data ?? []
  const rail = useRail(products.length)

  if (!enabled) return null
  if (!query.isLoading && products.length === 0) return null

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-wide text-ink-900">
          <Flame className="h-5 w-5 text-brand-600" aria-hidden="true" />
          {title}
        </h2>

        <Link to="/products" className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700">
          {t('home.seeMore')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* Positioned parent for the overlaid arrows. */}
      <div className="relative">
        <RailArrows rail={rail} label="products" />

        {/*
           A share of the row, matching PRODUCT_GRID's column count exactly,
           so a trending card is the same size as a card in any grid on the
           site. Given here rather than by a grid track because the row has
           to overflow sideways instead of wrapping.
        */}
        <div ref={rail.ref} className="rail flex snap-x snap-mandatory gap-3 scroll-smooth pb-1">
          {(query.isLoading ? Array.from({ length: 6 }) : products).map((product, index) => (
            <div
              key={product?.id ?? index}
              className="w-[calc((100%-0.75rem)/2)] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/3)] md:w-[calc((100%-2.25rem)/4)] xl:w-[calc((100%-3rem)/5)]"
            >
              {product ? <ProductCard product={product} /> : <ProductCardSkeleton />}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function HomePage() {
  const { t } = useTranslation()
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

      <CategoryStrip />

      <TrendingSection />

      {sections.isLoading || latest.isLoading ? (
        <section className="mt-8">
          <div className="mb-3 h-6 w-32 animate-pulse rounded bg-ink-200" />
          <div className={PRODUCT_GRID}>
            {Array.from({ length: 5 }).map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        </section>
      ) : hasSections ? (
        sections.data.map((section) => <CategorySection key={section.id} section={section} />)
      ) : (latest.data?.data ?? []).length > 0 ? (
        <CategorySection
          section={{ id: 'latest', name: t('home.latestProducts'), slug: '', products: latest.data.data }}
        />
      ) : (
        <div className="mt-8 rounded-lg border border-ink-200 bg-white">
          <EmptyState
            title={t('home.noProductsYet')}
            description={t('home.noProductsYetBody')}
          />
        </div>
      )}
    </div>
  )
}
