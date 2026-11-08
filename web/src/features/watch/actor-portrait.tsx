import { useState } from 'react'

import { imageURL } from '@/api/client'
import { actorAvatarURL } from '@/api/library'
import { cn } from 'cn'

// GFriends portraits come first, by the Japanese name when one is known; the
// catalogue avatar and then an icon stand in when it has none.
export function ActorPortrait({
  name,
  alias,
  avatar,
  className
}: {
  name: string
  alias?: string
  avatar?: string
  className?: string
}) {
  const sources = [
    ...(alias ? [actorAvatarURL(alias)] : []),
    actorAvatarURL(name),
    ...(avatar ? [imageURL(avatar)] : [])
  ]
  const [index, setIndex] = useState(0)
  const source = sources[index]
  return (
    <span
      className={cn(
        '@container relative block overflow-hidden rounded-full bg-linear-to-br from-muted to-card',
        className
      )}
    >
      {source ? (
        <img
          key={source}
          src={source}
          alt={name}
          loading="lazy"
          decoding="async"
          className="size-full object-cover object-top"
          onError={() => setIndex(value => value + 1)}
        />
      ) : (
        <span className="flex size-full items-center justify-center font-serif text-[36cqw] text-muted-foreground">
          {name.slice(0, 1)}
        </span>
      )}
    </span>
  )
}
