import { UserIcon } from 'lucide-react'

import { imageURL } from '@/api/client'
import { type LibraryFacetKind, useLibraryFacets } from '@/api/library'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { facetLabels } from './facet-filters'

const lists = {
  actor: 'actors',
  maker: 'makers',
  series: 'series',
  tag: 'tags',
  year: 'years'
} as const

export function ProfileHeader({ kind, name }: { kind: LibraryFacetKind; name: string }) {
  const facets = useLibraryFacets()
  const facet = facets.data?.[lists[kind]].find(item => item.name === name)
  return (
    <section className="flex items-center gap-4 rounded-2xl bg-muted p-4 ring-1 ring-border dark:bg-card/60 dark:ring-0">
      {kind === 'actor' ? (
        <Avatar className="size-20 sm:size-24">
          {facet?.avatar ? (
            <AvatarImage src={imageURL(facet.avatar)} alt={name} className="object-cover" />
          ) : null}
          <AvatarFallback>
            <UserIcon className="size-8 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
      ) : null}
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted-foreground">{facetLabels[kind]}</p>
        <h2 className="text-2xl font-bold break-words">{name}</h2>
        <p className="text-sm text-muted-foreground">
          {facet ? `媒体库里有 ${facet.count} 部作品` : facets.isPending ? '统计中…' : ''}
        </p>
      </div>
    </section>
  )
}
