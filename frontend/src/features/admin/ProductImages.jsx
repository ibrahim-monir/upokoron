import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, ImagePlus, Star, Trash2, Upload } from 'lucide-react'
import { api } from '../../lib/api'
import { cx } from '../../lib/format'
import { Button, useToast } from '../../components/ui'
import { MediaPicker } from './media/MediaLibrary'

/**
 * The product gallery.
 *
 * Everything goes through the media library, including a direct upload: the
 * file is added to the library first and then attached to the product. It
 * costs one extra request and buys two things -- the same photo used on six
 * products is stored once, and the library can refuse to delete an image
 * that a product page is still showing.
 *
 * On a NEW product there is no id to attach to yet, so choices are held here
 * and written when the product is saved. That is why this component reports
 * its list upward rather than owning the server state: the parent form is
 * what knows when the product exists.
 */
export function ProductImages({ productId, value, onChange }) {
  const toast = useToast()
  const fileInput = useRef(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

  const images = value ?? []

  const add = (items) => {
    const existing = new Set(images.map((image) => image.url))
    const fresh = items.filter((item) => !existing.has(item.url))

    if (fresh.length === 0) {
      toast.error('That image is already on this product.')
      return
    }

    onChange([...images, ...fresh])
  }

  /**
   * Upload straight from the picker button.
   *
   * The FileList is snapshotted before the input is reset -- clearing
   * input.value empties a live FileList, and the upload then posts nothing.
   */
  const upload = async (fileList) => {
    const files = Array.from(fileList ?? [])

    if (files.length === 0) return

    setUploading(true)

    try {
      const form = new FormData()

      files.forEach((file) => form.append('files[]', file))
      form.append('folder', 'products')

      const { data } = await api.post('/admin/media', form)

      add((data.data ?? []).map((media) => ({ media_id: media.id, url: media.url, alt: media.alt })))
    } catch (error) {
      toast.error(error?.message ?? 'Could not upload that image.')
    } finally {
      setUploading(false)
    }
  }

  const move = (index, delta) => {
    const next = [...images]
    const target = index + delta

    if (target < 0 || target >= next.length) return

    ;[next[index], next[target]] = [next[target], next[index]]

    onChange(next)
  }

  const remove = (index) => onChange(images.filter((_, i) => i !== index))

  return (
    <div className="flex flex-col gap-3">
      {images.length === 0 ? (
        <div className="rounded-card border-2 border-dashed border-ink-200 p-6 text-center">
          <ImageIcon className="mx-auto h-8 w-8 text-ink-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink-700">No images yet</p>
          <p className="mt-0.5 text-sm text-ink-500">
            A product without a photo barely sells. Add at least one.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
          {images.map((image, index) => (
            <li key={image.url} className="group relative">
              <span
                className={cx(
                  'block overflow-hidden rounded-lg border-2 bg-ink-50',
                  index === 0 ? 'border-brand-600' : 'border-ink-200',
                )}
              >
                <span className="block aspect-square">
                  <img src={image.url} alt={image.alt ?? ''} className="h-full w-full object-cover" />
                </span>
              </span>

              {/*
                First in the list is the primary image -- the one the shop
                and every product card shows. Said out loud, because an
                invisible rule about position is a rule nobody knows.
              */}
              {index === 0 && (
                <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                  Main
                </span>
              )}

              <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label="Move earlier"
                  className="grid h-6 w-6 place-items-center rounded bg-white/90 text-ink-700 shadow-card disabled:opacity-30"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label="Remove image"
                  className="grid h-6 w-6 place-items-center rounded bg-white/90 text-danger-700 shadow-card"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === images.length - 1}
                  aria-label="Move later"
                  className="grid h-6 w-6 place-items-center rounded bg-white/90 text-ink-700 shadow-card disabled:opacity-30"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setPickerOpen(true)}>
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          Choose from library
        </Button>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={uploading}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Upload new
        </Button>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? [])
            event.target.value = ''
            upload(picked)
          }}
        />
      </div>

      {images.length > 1 && (
        <p className="text-xs text-ink-500">
          The first image is the main one. Use the arrows to reorder.
        </p>
      )}

      <MediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        folder="products"
        title="Choose product images"
        onSelect={(media) => add([{ media_id: media.id, url: media.url, alt: media.alt }])}
      />

      {productId === null && images.length > 0 && (
        <p className="text-xs text-ink-500">
          These are attached when you save the product.
        </p>
      )}
    </div>
  )
}

/**
 * Write the gallery to the server.
 *
 * Called after the product itself is saved, because attaching needs an id.
 * Deliberately a plain function rather than a hook: the form calls it from
 * inside its submit handler, where hooks cannot go.
 */
export async function syncProductImages(productId, images, original = []) {
  const keptIds = new Set(images.filter((image) => image.id).map((image) => image.id))

  // Removals first, so a product is never briefly showing an image the user
  // has just deleted.
  for (const image of original) {
    if (!keptIds.has(image.id)) {
      await api.delete(`/admin/products/${productId}/images/${image.id}`)
    }
  }

  const attached = []

  for (const image of images) {
    if (image.id) {
      attached.push(image.id)
      continue
    }

    const { data } = await api.post(`/admin/products/${productId}/images`, {
      media_id: image.media_id,
      alt: image.alt ?? null,
    })

    attached.push(data.image.id)
  }

  if (attached.length > 0) {
    // Order and primary in one call: the first id is the main image, which
    // is the rule the grid shows.
    await api.post(`/admin/products/${productId}/images/reorder`, { image_ids: attached })
    await api.post(`/admin/products/${productId}/images/${attached[0]}/primary`)
  }
}

/** Turns the API's product payload into the shape this component holds. */
export function imagesFromProduct(product) {
  return (product?.images ?? []).map((image) => ({
    id: image.id,
    url: image.url,
    alt: image.alt,
  }))
}
