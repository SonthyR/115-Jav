import { createContext, useContext } from 'react'

import { useIsMovieViewed } from '@/api/browse-history'
import type { DiscoverMovie } from '@/api/discover'
import type { MovieIdentity } from '@/api/movie-states'
import { useMovieState } from '@/api/movie-states'
import { Badge } from '@/components/ui/badge'

export const ResourceBadgeLimitContext = createContext<number | undefined>(undefined)

export function MovieResourceBadges({ movie }: { movie: DiscoverMovie }) {
  const limit = useContext(ResourceBadgeLimitContext)
  const badges = [
    movie.magnets_count > 0 ? '含磁力' : null,
    movie.has_subtitle ? '字幕' : null,
    movie.release_status === 'upcoming' ? '即将发行' : null,
    movie.has_preview ? '有预览' : null
  ].filter((badge): badge is string => badge !== null)

  return (limit === undefined ? badges : badges.slice(0, limit)).map(badge => (
    <Badge key={badge} variant="outline">
      {badge}
    </Badge>
  ))
}

export function MovieStateBadge({
  movie,
  hideViewed = false
}: {
  movie: MovieIdentity
  hideViewed?: boolean
}) {
  const { state } = useMovieState(movie)
  const isViewed = useIsMovieViewed(movie.id)

  if (state === 'in_library') {
    return <Badge variant="library">已入库</Badge>
  }
  if (state === 'saving') {
    return <Badge variant="downloading">下载中</Badge>
  }
  if (state === 'processing') {
    return <Badge variant="frosted">入库处理中</Badge>
  }
  if (!hideViewed && isViewed) {
    return <Badge variant="success">已浏览</Badge>
  }
  return null
}
