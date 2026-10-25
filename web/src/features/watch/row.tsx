import { Link, type LinkProps } from '@tanstack/react-router'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import { cn } from 'cn'

// A titled row that scrolls sideways, as on a streaming home page.
export function Row({
  title,
  link,
  action,
  children
}: {
  title: string
  // Where 全部 leads, usually the library with this row's filter.
  link?: Pick<LinkProps, 'to' | 'search' | 'params'>
  action?: ReactNode
  children: ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  const measure = useCallback(() => {
    const element = scroller.current
    if (!element) return
    setEdges({
      start: element.scrollLeft <= 4,
      end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 4
    })
  }, [])
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [measure, children])

  // Each press moves almost a screenful, keeping one card in view for context.
  const page = (direction: 1 | -1) => {
    const element = scroller.current
    if (!element) return
    element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section className="group/row space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-lg font-semibold">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {link ? (
            <Link
              {...link}
              className="flex items-center text-sm text-muted-foreground hover:text-foreground"
            >
              全部
              <ChevronRightIcon className="size-4" />
            </Link>
          ) : null}
        </div>
      </div>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={measure}
          className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2"
        >
          {children}
        </div>
        <PageButton side="left" hidden={edges.start} onClick={() => page(-1)} />
        <PageButton side="right" hidden={edges.end} onClick={() => page(1)} />
      </div>
    </section>
  )
}

// Mouse users get arrows on hover; touch screens swipe instead.
function PageButton({
  side,
  hidden,
  onClick
}: {
  side: 'left' | 'right'
  hidden: boolean
  onClick: () => void
}) {
  const Icon = side === 'left' ? ChevronLeftIcon : ChevronRightIcon
  return (
    <button
      type="button"
      aria-label={side === 'left' ? '向左翻' : '向右翻'}
      tabIndex={-1}
      onClick={onClick}
      className={cn(
        'absolute top-0 bottom-2 z-10 hidden w-10 items-center justify-center bg-background/70 text-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover/row:opacity-100 [@media(hover:hover)]:flex',
        side === 'left' ? '-left-4 rounded-r-xl' : '-right-4 rounded-l-xl',
        hidden && 'pointer-events-none group-hover/row:opacity-0'
      )}
    >
      <Icon className="size-6" />
    </button>
  )
}
