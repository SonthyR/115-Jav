import { cn } from 'cn'
import { getPageNumbers } from '@/lib/pagination'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination'

export function ListPagination({
  page,
  totalPages,
  hasMore,
  disabled,
  scrollToTop = true,
  onPageChange
}: {
  page: number
  totalPages?: number
  hasMore: boolean
  disabled: boolean
  scrollToTop?: boolean
  onPageChange: (page: number) => void
}) {
  function changePage(nextPage: number) {
    if (nextPage === page) return
    onPageChange(nextPage)
    if (scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function renderPage(item: number) {
    if (item === page) {
      return (
        <PaginationItem key={item}>
          <PaginationLink
            isActive
            className="size-8 rounded-full border-0 bg-foreground font-mono text-xs text-background hover:bg-foreground/90 hover:text-background"
          >
            {item}
          </PaginationLink>
        </PaginationItem>
      )
    }
    return (
      <PaginationItem key={item}>
        <PaginationLink
          href="#"
          tabIndex={disabled ? -1 : undefined}
          className={cn(
            'size-8 rounded-full font-mono text-xs text-muted-foreground hover:text-foreground',
            disabled && 'pointer-events-none opacity-50'
          )}
          onClick={e => {
            e.preventDefault()
            changePage(item)
          }}
        >
          {item}
        </PaginationLink>
      </PaginationItem>
    )
  }

  const singlePage = page <= 1 && !hasMore && (totalPages === undefined || totalPages <= 1)
  if (singlePage) return null

  const items = totalPages === undefined ? [page] : getPageNumbers(page, totalPages)

  return (
    <Pagination className="py-6">
      <PaginationContent className="gap-1 rounded-full border border-border bg-card/45 p-1.5">
        <PaginationItem>
          <PaginationPrevious
            text="上一页"
            disabled={page <= 1 || disabled}
            onClick={() => changePage(page - 1)}
            className="h-8 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground"
          />
        </PaginationItem>

        {items.map(item =>
          typeof item === 'number' ? (
            renderPage(item)
          ) : (
            <PaginationItem key={item}>
              <PaginationEllipsis className="size-8 text-muted-foreground" />
            </PaginationItem>
          )
        )}

        <PaginationItem>
          <PaginationNext
            text="下一页"
            disabled={disabled || !hasMore}
            onClick={() => changePage(page + 1)}
            className="h-8 rounded-full px-2 text-xs text-muted-foreground hover:text-foreground"
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
