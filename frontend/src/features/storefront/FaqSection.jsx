import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Minus, Plus } from 'lucide-react'

import { get } from '../../lib/api'
import { cx } from '../../lib/format'

function FaqItem({ faq, open, onToggle, index }) {
  return (
    <div
      style={{ animationDelay: `${120 + index * 60}ms` }}
      className={cx(
        'rise overflow-hidden rounded-card border bg-white transition-colors',
        open ? 'border-brand-300' : 'border-ink-200 hover:border-ink-300',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="text-sm font-semibold text-ink-900">{faq.question}</span>

        <span
          className={cx(
            'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors',
            open ? 'bg-brand-600 text-white' : 'text-ink-500',
          )}
        >
          {open ? (
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </span>
      </button>

      {/*
         A max-height transition rather than mounting and unmounting, so the
         answer slides rather than appearing. The grid trick would measure
         itself, but a generous cap costs nothing at these lengths.
      */}
      <div
        className={cx(
          'grid transition-[grid-template-rows,opacity] duration-300 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <p className="whitespace-pre-line px-5 pb-4 text-sm leading-6 text-ink-600">
            {faq.answer}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * The questions this shop is actually asked.
 *
 * Nothing renders until the owner has written one -- a heading over an empty
 * list, or over invented questions, is worse than no section. The first is
 * open on arrival, because an accordion where everything is shut looks like
 * a list of things you are not allowed to read yet.
 */
export function FaqSection({ title, intro }) {
  const [openId, setOpenId] = useState(null)

  const query = useQuery({
    queryKey: ['shop', 'faqs'],
    queryFn: () => get('/shop/faqs'),
    staleTime: 5 * 60 * 1000,
    select: (response) => response.data,
  })

  const faqs = query.data ?? []

  if (query.isLoading || faqs.length === 0) return null

  const activeId = openId ?? faqs[0].id

  return (
    <section className="mt-10 grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-12">
      <div className="rise">
        <h2 className="text-2xl font-bold leading-tight text-ink-900 sm:text-3xl">{title}</h2>

        {intro && <p className="mt-3 text-ink-600">{intro}</p>}

        <Link
          to="/contact"
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
        >
          Still stuck? Ask us
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        {faqs.map((faq, index) => (
          <FaqItem
            key={faq.id}
            faq={faq}
            index={index}
            open={activeId === faq.id}
            // Clicking the open one shuts it; -1 rather than null, because
            // null would fall back to "first open" and it would not close.
            onToggle={() => setOpenId(activeId === faq.id ? -1 : faq.id)}
          />
        ))}
      </div>
    </section>
  )
}
