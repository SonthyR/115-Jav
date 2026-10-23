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
        'group flex min-w-0 flex-col items-center gap-2 text-center outline-ring',
        className
      )}
    >
      <ActorPortrait
        name={actor.name}
        alias={actor.alias}
        avatar={actor.avatar}
        className="aspect-square w-full ring-1 ring-foreground/10 transition-transform duration-300 group-hover:scale-105"
      />
      <span className="w-full">
        <span className="block truncate text-sm font-medium">{actor.name}</span>
        <span className="block text-xs text-muted-foreground">{actor.count} 部</span>
      </span>
    </Link>
  )
}
