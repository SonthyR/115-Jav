import { Link } from '@tanstack/react-router'
import type { LibraryFacet } from '@/api/library'
import { cn } from 'cn'
import { ActorPortrait } from './actor-portrait'

// A round portrait that opens the actor's page.
export function ActorTile({ actor, className }: { actor: LibraryFacet; className?: string }) {
  return (
    <Link
      to="/browse/$kind/$name"
      params={{ kind: 'actor', name: actor.name }}
      className={cn(
        'group flex min-w-0 flex-col items-center gap-3 text-center outline-ring',
        className
      )}
    >
      <ActorPortrait
        name={actor.name}
        alias={actor.alias}
        avatar={actor.avatar}
        className="aspect-square w-full transition duration-500 group-hover:scale-[1.03] group-hover:brightness-110"
      />
      <span className="w-full">
        <span className="block truncate text-sm">{actor.name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{actor.count} 部</span>
      </span>
    </Link>
  )
}
