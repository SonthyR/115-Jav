import { Link } from '@tanstack/react-router'
import { UserIcon } from 'lucide-react'

import { imageURL } from '@/api/client'
import type { LibraryFacet } from '@/api/library'
import { cn } from 'cn'

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
      <span className="relative block aspect-square w-full overflow-hidden rounded-full bg-muted ring-1 ring-foreground/10 transition-transform duration-300 group-hover:scale-105">
        {actor.avatar ? (
          <img
            src={imageURL(actor.avatar)}
            alt={actor.name}
            loading="lazy"
            decoding="async"
            className="size-full object-cover object-top"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <UserIcon className="size-1/3" />
          </span>
        )}
      </span>
      <span className="w-full">
        <span className="block truncate text-sm font-medium">{actor.name}</span>
        <span className="block text-xs text-muted-foreground">{actor.count} 部</span>
      </span>
    </Link>
  )
}
