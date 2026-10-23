import { type LibraryFacetKind, useLibraryFacets } from '@/api/library'
import { ActorPortrait } from '@/features/watch/actor-portrait'
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
        <ActorPortrait
          key={name}
          name={name}
          alias={facet?.alias}
          avatar={facet?.avatar}
          className="size-20 shrink-0 sm:size-24"
        />
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
