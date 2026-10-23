import { useRouter } from '@tanstack/react-router'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren
} from 'react'

import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { MovieDetailDialogContext, movieDetailKey, type MovieDetailTarget } from './dialog-context'
import { MovieDetailSkeleton } from './skeleton'

const MovieDetailContent = lazy(() =>
  import('./content').then(module => ({ default: module.MovieDetailContent }))
)

export function MovieDetailDialogProvider({ children }: PropsWithChildren) {
  const router = useRouter()
  const [movie, setMovie] = useState<MovieDetailTarget>()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const openMovie = useCallback(
    (target: MovieDetailTarget, trigger: HTMLDivElement) => {
      // Recommendations replace the detail while retaining the original list's focus target.
      if (!open) triggerRef.current = trigger
      setMovie(target)
      setOpen(true)
    },
    [open]
  )

  useEffect(() => router.subscribe('onBeforeNavigate', () => setOpen(false)), [router])

  return (
    <MovieDetailDialogContext value={openMovie}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          ref={contentRef}
          showCloseButton={false}
          className="flex h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(56rem,calc(100dvh-2rem))] sm:w-[calc(100%-2rem)] sm:max-w-6xl sm:rounded-4xl"
          onOpenAutoFocus={event => {
            event.preventDefault()
            contentRef.current?.focus()
          }}
          onCloseAutoFocus={event => {
            event.preventDefault()
            triggerRef.current?.focus({ preventScroll: true })
          }}
        >
          <DialogTitle className="sr-only">影片详情</DialogTitle>
          {/* Full-screen on phones, where there is no backdrop to tap. */}
          <DialogClose asChild>
            <Button
              variant="secondary"
              size="icon"
              aria-label="关闭"
              className="absolute top-3 right-3 z-10 rounded-full shadow-md sm:hidden"
            >
              <XIcon />
            </Button>
          </DialogClose>
          <div
            key={movie && movieDetailKey(movie)}
            className="min-h-0 flex-1 scroll-fade scrollbar-none overflow-y-auto overscroll-contain p-4 sm:p-6 [&::-webkit-scrollbar]:hidden"
          >
            <Suspense fallback={<MovieDetailSkeleton />}>
              {movie ? <MovieDetailContent movie={movie} /> : null}
            </Suspense>
          </div>
        </DialogContent>
      </Dialog>
    </MovieDetailDialogContext>
  )
}
