import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Gift,
  Heart,
  ImageOff,
  Layers,
  Minus,
  PackageOpen,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Truck,
} from 'lucide-react'
import { ApiError, get } from '../../lib/api'
import { cx, money } from '../../lib/format'
import { useWishlistStore } from '../../stores/wishlistStore'
import {
  Badge,
  Button,
  ErrorState,
  PageLoader,
  Pagination,
  Spinner,
  Textarea,
  useToast,
} from '../../components/ui'
import { FacebookIcon, WhatsAppIcon, XIcon } from '../../components/BrandIcons'
import { useAuthStore } from '../../stores/authStore'
import { applyServerErrors } from '../auth/applyServerErrors'
import { useAddToCart } from '../cart/useCart'
import { TrendingSection } from './HomePage'
import { ProductCard, ProductCardSkeleton } from './ProductCard'
import { RailArrows, useRail } from './Rail'
import {
  useDeleteReview,
  useMyReview,
  useProductReviews,
  useSubmitReview,
  useUpdateReview,
} from './useReviews'

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

const reviewSchema = z.object({
  title: z.string().max(150).optional().or(z.literal('')),
  comment: z.string().min(1, 'Write a few words about the product.').max(2000),
})

function RatingInput({ value, onChange, error }) {
  return (
    <div>
      <label className="text-sm font-medium text-ink-800">
        Your rating
        <span className="ml-0.5 text-danger-500" aria-hidden="true">*</span>
      </label>
      <div className="mt-1.5 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            aria-pressed={n === value}
          >
            <Star
              className={cx('h-6 w-6', n <= value ? 'fill-amber-400 text-amber-400' : 'text-ink-300')}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-danger-700">{error}</p>}
    </div>
  )
}

/** Write a new review, or edit the customer's existing one. */
function ReviewForm({ slug, existing, onDone }) {
  const toast = useToast()
  const submit = useSubmitReview(slug)
  const update = useUpdateReview(slug)
  const isEditing = Boolean(existing)
  const mutation = isEditing ? update : submit

  const [rating, setRating] = useState(existing?.rating ?? 0)
  const [ratingError, setRatingError] = useState(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(reviewSchema),
    defaultValues: { title: existing?.title ?? '', comment: existing?.comment ?? '' },
  })

  const onSubmit = async (values) => {
    if (rating < 1) {
      setRatingError('Pick a rating.')
      return
    }
    setRatingError(null)

    try {
      await mutation.mutateAsync(isEditing ? { reviewId: existing.id, rating, ...values } : { rating, ...values })
      toast.success(isEditing ? 'Review updated. It will show once approved again.' : 'Thanks! Your review will show once approved.')
      onDone?.()
    } catch (error) {
      if (error instanceof ApiError) {
        applyServerErrors(error, setError, toast)
        return
      }
      toast.error('Could not save your review.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 rounded-card border border-ink-200 p-4" noValidate>
      <RatingInput value={rating} onChange={setRating} error={ratingError} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-title" className="text-sm font-medium text-ink-800">Title</label>
        <input
          id="review-title"
          className="h-10 rounded-lg border border-ink-300 bg-white px-3 text-sm text-ink-900 hover:border-ink-400"
          placeholder="Sum up your review"
          {...register('title')}
        />
        {errors.title?.message && <p className="text-xs text-danger-700">{errors.title.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="review-comment" className="text-sm font-medium text-ink-800">
          Your review
          <span className="ml-0.5 text-danger-500" aria-hidden="true">*</span>
        </label>
        <Textarea id="review-comment" invalid={Boolean(errors.comment)} {...register('comment')} />
        {errors.comment?.message && <p className="text-xs text-danger-700">{errors.comment.message}</p>}
      </div>

      <div className="flex gap-2">
        <Button type="submit" loading={mutation.isPending}>
          {isEditing ? 'Update review' : 'Submit review'}
        </Button>
        {isEditing && (
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

function ReviewItem({ review, isMine, onEdit, onDelete, deleting }) {
  return (
    <div className="flex flex-col gap-2 border-b border-ink-100 py-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={cx('h-4 w-4', i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-ink-300')}
                aria-hidden="true"
              />
            ))}
          </div>

          {review.is_verified_purchase && <Badge tone="success">Verified Purchase</Badge>}

          {review.status_label && review.status !== 'approved' && (
            <Badge tone={review.status === 'rejected' ? 'danger' : 'warning'}>{review.status_label}</Badge>
          )}
        </div>

        {isMine && (
          <div className="flex gap-3 text-xs">
            <button type="button" onClick={onEdit} className="font-medium text-brand-700 hover:underline">
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={deleting}
              className="font-medium text-danger-700 hover:underline disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {review.title && <p className="font-semibold text-ink-900">{review.title}</p>}
      <p className="text-sm leading-relaxed text-ink-700">{review.comment}</p>
      <p className="text-xs text-ink-400">
        {review.customer_name ?? 'Customer'}
        {review.created_at ? ` · ${new Date(review.created_at).toLocaleDateString()}` : ''}
      </p>
    </div>
  )
}

/** The Review tab: the rating summary, the customer's own review (or a form to write one), and the approved review list. */
function ReviewsPanel({ product }) {
  const slug = product.slug
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(false)

  const reviewsQuery = useProductReviews(slug, { page })
  const myReviewQuery = useMyReview(slug, { enabled: isAuthenticated })
  const deleteReview = useDeleteReview(slug)

  const reviews = reviewsQuery.data?.data ?? []
  const myReview = myReviewQuery.data?.data ?? null
  const canReview = myReviewQuery.data?.can_review ?? false

  const handleDelete = () => {
    if (!myReview) return
    if (!window.confirm('Delete your review?')) return

    deleteReview.mutate(myReview.id, {
      onSuccess: () => toast.success('Review removed.'),
      onError: (error) => toast.error(error?.message ?? 'Could not delete your review.'),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <StarRating value={product.rating_avg} count={product.rating_count} />

      {isAuthenticated ? (
        myReview && !editing ? (
          <div>
            <p className="mb-2 text-sm font-medium text-ink-800">Your review</p>
            <div className="rounded-card border border-ink-200 px-4">
              <ReviewItem
                review={myReview}
                isMine
                onEdit={() => setEditing(true)}
                onDelete={handleDelete}
                deleting={deleteReview.isPending}
              />
            </div>
          </div>
        ) : myReview && editing ? (
          <ReviewForm slug={slug} existing={myReview} onDone={() => setEditing(false)} />
        ) : canReview ? (
          <ReviewForm slug={slug} />
        ) : (
          !myReviewQuery.isLoading && (
            <p className="text-sm text-ink-500">You can review this product once it has been delivered to you.</p>
          )
        )
      ) : (
        <p className="text-sm text-ink-500">
          <Link to="/login" className="font-medium text-brand-700 underline underline-offset-4">
            Sign in
          </Link>{' '}
          to write a review.
        </p>
      )}

      {reviewsQuery.isLoading ? (
        <Spinner />
      ) : reviews.length === 0 ? (
        <p className="text-sm text-ink-500">No reviews yet.</p>
      ) : (
        <div>
          {reviews.map((review) => (
            <ReviewItem key={review.id} review={review} />
          ))}
          <Pagination meta={reviewsQuery.data?.meta} onPage={setPage} />
        </div>
      )}
    </div>
  )
}

/**
 * Real related products -- same category, current one excluded. Styled the
 * same way as the home page's Trending rail (icon heading, "See More", a
 * snap-scroll row with overlaid arrows) so a product page reads as a
 * continuation of the same design language rather than a different section
 * type. Nothing shown if there is no category or nothing else in it.
 */
function RelatedProducts({ categorySlug, excludeId }) {
  const query = useQuery({
    queryKey: ['shop', 'products', 'related', categorySlug],
    // More than fits on one row, so there is something to slide to -- the
    // same reasoning TrendingSection uses for its own limit.
    queryFn: () => get('/shop/products', { params: { category: categorySlug, per_page: 10 } }),
    enabled: Boolean(categorySlug),
    select: (response) => response.data,
  })

  const products = (query.data ?? []).filter((product) => product.id !== excludeId)
  const rail = useRail(products.length)

  if (!categorySlug) return null
  if (query.isSuccess && products.length === 0) return null

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold uppercase tracking-wide text-ink-900">
          <Layers className="h-5 w-5 text-brand-600" aria-hidden="true" />
          Related Products
        </h2>

        <Link
          to={`/category/${categorySlug}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          See More
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {/* Positioned parent for the overlaid arrows. */}
      <div className="relative">
        <RailArrows rail={rail} label="related products" />

        <div ref={rail.ref} className="rail flex snap-x snap-mandatory gap-3 scroll-smooth pb-1">
          {(query.isLoading ? Array.from({ length: 5 }) : products).map((product, index) => (
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

/**
 * One accessory beside the product, as a row rather than a card.
 *
 * The full ProductCard is built for a grid: a square image, a two-line name,
 * ratings, points and a button, all stacked. Two of those in a half-width
 * column are taller than the product they are meant to accompany, which puts
 * the cross-sell in a shouting match with the sale. A thumbnail, a name, a
 * price and one button says the same thing in a fifth of the height.
 */
/**
 * The accessories picked for this product.
 *
 * A hook rather than a query inside the block, because the page itself has
 * to know whether there are any before it can decide how wide the
 * description gets.
 */
function useStoreSettings() {
  return useQuery({
    queryKey: ['shop', 'settings'],
    queryFn: () => get('/shop/settings'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })
}

function useGoesWith(slug) {
  const query = useQuery({
    queryKey: ['shop', 'products', 'goes-with', slug],
    queryFn: () => get(`/shop/products/${slug}/goes-with`, { params: { limit: 10 } }),
    enabled: Boolean(slug),
    select: (response) => response.data,
  })

  return query.data ?? []
}

/**
 * Accessories as full cards, beside the description.
 *
 * Two across, because this sits in half a row next to the description. What
 * happens when there are more than two is the owner's call: slide through
 * them, or show the first two and stop. Off by default -- arrows here
 * compete with the product itself for the same attention.
 */
function GoesWithCards({ products, title, slide }) {
  const canSlide = slide && products.length > 2
  const rail = useRail(canSlide ? products.length : 0)

  const heading = (
    <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
      <Sparkles className="h-5 w-5 text-brand-600" aria-hidden="true" />
      {title}
    </h2>
  )

  if (!canSlide) {
    return (
      <section>
        <div className="mb-3">{heading}</div>

        <div className="grid grid-cols-2 gap-3">
          {products.slice(0, 2).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    )
  }

  return (
    <section>
      <div className="mb-3">{heading}</div>

      {/* Positioned parent for the overlaid arrows. */}
      <div className="relative">
        <RailArrows rail={rail} label="accessories" />

        <div ref={rail.ref} className="rail flex snap-x snap-mandatory gap-3 scroll-smooth pb-1">
          {products.map((product) => (
            <div
              key={product.id}
              // Two visible, the same as the grid above, so turning sliding
              // on changes how many there are rather than how big they look.
              className="w-[calc((100%-0.75rem)/2)] shrink-0 snap-start"
            >
              <ProductCard product={product} />
            </div>
          ))}
        </div>
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

  const goesWith = useGoesWith(slug)
  const { data: settings } = useStoreSettings()

  const wishlistItems = useWishlistStore((state) => state.items)
  const toggleWishlist = useWishlistStore((state) => state.toggle)

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
        <Link to="/products" className="mt-4 inline-block text-sm text-brand-800 underline">
          Back to all products
        </Link>
      </div>
    )
  }

  const product = query.data
  const saved = wishlistItems.some((item) => item.id === product.id)
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
                className="h-full w-full object-contain"
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
                  <img src={image.url} alt="" className="h-full w-full object-contain" />
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
            <span className="tabular text-3xl font-bold text-brand-800">{money(price)}</span>
            {hasDiscount && <span className="tabular text-lg text-ink-400 line-through">{money(wasPrice)}</span>}
          </div>

          {/*
             The promise now leads to its terms. It said "earn 12 points"
             with nowhere on the site explaining what a point is worth.
          */}
          {Number(selected?.reward_points) > 0 && (
            <Link
              to="/rewards"
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-accent-600 hover:text-accent-700 hover:underline"
            >
              <Gift className="h-4 w-4" aria-hidden="true" />
              Earn {selected.reward_points} reward points on this purchase
            </Link>
          )}

          {product.short_description &&
            (product.short_description_style === 'list' ? (
              <ul className="list-disc space-y-1 pl-5 text-ink-600">
                {product.short_description
                  .split('\n')
                  .map((line) => line.trim())
                  .filter(Boolean)
                  .map((line, index) => <li key={index}>{line}</li>)}
              </ul>
            ) : (
              <p className="text-ink-600">{product.short_description}</p>
            ))}

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
              onClick={() => toggleWishlist(product)}
              aria-pressed={saved}
              aria-label={
                saved
                  ? `Remove ${product.name} from your wishlist`
                  : `Save ${product.name} to your wishlist`
              }
              title={saved ? 'Saved to your wishlist' : 'Save to your wishlist'}
              className={cx(
                'grid h-11 w-11 shrink-0 place-items-center rounded-lg border transition-colors',
                saved
                  ? 'border-danger-300 text-danger-600'
                  : 'border-ink-200 text-ink-500 hover:border-danger-300 hover:text-danger-600',
              )}
            >
              <Heart
                className="h-5 w-5"
                fill={saved ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
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
                  <Link to={`/category/${product.category.slug}`} className="text-brand-800 hover:underline">
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
                className="grid h-8 w-8 place-items-center rounded-full bg-ink-100 text-ink-600 hover:bg-brand-100 hover:text-brand-800"
              >
                <Icon className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/*
         --------------------------------------------------- tabs

         Accessories take half the row when there are any, and the
         description takes the other half. With nothing to pair, a
         half-width description beside an empty column would be worse than
         the full width it had before -- so the split only exists when
         there is something to put in it.
      */}
      <div className={cx(goesWith.length > 0 && 'grid items-start gap-8 lg:grid-cols-2')}>
        {goesWith.length > 0 && (
          <GoesWithCards
            products={goesWith}
            title={settings?.product_pairs_title || 'You May Also Like'}
            slide={settings?.product_pairs_slide === true}
          />
        )}

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
                  ? 'border-brand-600 text-brand-800'
                  : 'border-transparent text-ink-500 hover:text-ink-800',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="max-w-3xl py-5">
          {tab === 'description' &&
            (product.description ? (
              // Written with the admin's rich text editor and stored as HTML;
              // a description saved before that editor existed is plain text
              // and gets the old line-break treatment instead.
              /<[a-z][\s\S]*>/i.test(product.description) ? (
                <div
                  className="prose-content leading-relaxed text-ink-700"
                  dangerouslySetInnerHTML={{ __html: product.description }}
                />
              ) : (
                <p className="whitespace-pre-line leading-relaxed text-ink-700">{product.description}</p>
              )
            ) : (
              <p className="text-sm text-ink-500">No description has been written for this product yet.</p>
            ))}

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

          {tab === 'review' && <ReviewsPanel product={product} />}
          </div>
        </div>
      </div>

      <RelatedProducts categorySlug={product.category?.slug} excludeId={product.id} />

      <TrendingSection />

      <section className="grid gap-3 border-t border-ink-200 pt-6 sm:grid-cols-3">
        {TRUST.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-800">
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
