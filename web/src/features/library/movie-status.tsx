import type { LibraryMovie } from '@/api/library'
import { Badge } from '@/components/ui/badge'

export function LibraryMovieStatus({ movie }: { movie: LibraryMovie }) {
  const dot = <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
  return (
    <>
      {movie.scrape_status === 'done' ? (
        <Badge variant="success">
          {dot}
          已入库
        </Badge>
      ) : movie.scrape_status === 'failed' ? (
        <Badge variant="destructive">
          {dot}
          刮削失败
        </Badge>
      ) : (
        <Badge variant="outline" className="border-warning/35 bg-warning/5 text-warning">
          {dot}
          待刮削
        </Badge>
      )}
    </>
  )
}
