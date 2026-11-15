import { Link } from '@tanstack/react-router'
import type { LibraryFacet } from '@/api/library'
import { cn } from 'cn'
import { ActorPortrait } from './actor-portrait'

// A quiet portrait tile that opens the actor's page.
export function ActorTile({ actor, className }: { actor: LibraryFacet; className?: string }) {
  return (
    <Link
      to="/browse/$kind/$name"
      params={{ kind: 'actor', name: actor.name }}
      className={cn('group flex min-w-0 flex-col gap-2.5 outline-ring', className)}
    >
      <ActorPortrait
        name={actor.name}
        alias={actor.alias}
        avatar={actor.avatar}
        className="aspect-square w-full rounded-[9px] transition duration-300 group-hover:brightness-110 motion-reduce:transition-none"
      />
      <span className="w-full">
        <span className="block truncate text-sm">{actor.name}</span>
        <span className="mt-1 block font-mono text-[10px] text-muted-foreground tabular-nums">
          {actor.count} 部
        </span>
      </span>
    </Link>
  )
}
