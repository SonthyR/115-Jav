import { BookmarkIcon, CheckIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { describeApiError } from '@/api/client'
import {
  useCollections,
  useCreateCollection,
  useMovieCollections,
  useToggleCollection
} from '@/api/collections'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Puts the movie into collections or takes it out. The list loads only when
// opened, so a grid of posters each with this button stays cheap.
export function CollectionButton({
  movieId,
  look = 'button'
}: {
  movieId: number
  look?: 'button' | 'icon' | 'overlay'
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        {look === 'overlay' ? (
          <button
            type="button"
            aria-label="收藏"
            title="收藏"
            className="flex size-9 items-center justify-center rounded-full border border-white/40 text-white transition-colors hover:border-white"
          >
            <PlusIcon className="size-4" strokeWidth={1.75} />
          </button>
        ) : look === 'icon' ? (
          <Button
            variant="outline"
            size="icon-lg"
            className="size-12"
            aria-label="收藏"
            title="收藏"
          >
            <HeldIcon movieId={movieId} />
          </Button>
        ) : (
          <Button variant="outline">
            <HeldIcon movieId={movieId} />
            收藏
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 space-y-2 p-2">
        <CollectionMenu movieId={movieId} />
      </PopoverContent>
    </Popover>
  )
}

function HeldIcon({ movieId }: { movieId: number }) {
  const held = useMovieCollections(movieId)
  return held.data?.length ? (
    <BookmarkIcon data-icon="inline-start" className="fill-current text-gold" />
  ) : (
    <BookmarkIcon data-icon="inline-start" strokeWidth={1.75} />
  )
}

function CollectionMenu({ movieId }: { movieId: number }) {
  const collections = useCollections()
  const held = useMovieCollections(movieId)
  const toggle = useToggleCollection(movieId)
  const create = useCreateCollection()
  const [name, setName] = useState('')
  const members = new Set(held.data)

  const onError = (error: Error) => toast.error(describeApiError(error))

  return (
    <>
      <div className="max-h-60 overflow-y-auto">
        {collections.data?.map(item => {
          const member = members.has(item.id)
          return (
            <button
              key={item.id}
              type="button"
              disabled={toggle.isPending}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
              onClick={() => toggle.mutate({ id: item.id, member: !member }, { onError })}
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {member ? <CheckIcon className="size-4 text-gold" /> : null}
            </button>
          )
        })}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={event => {
          event.preventDefault()
          if (!name.trim()) return
          create.mutate(name, {
            onSuccess: created => {
              setName('')
              toggle.mutate({ id: created.id, member: true }, { onError })
            },
            onError
          })
        }}
      >
        <Input
          value={name}
          maxLength={100}
          placeholder="新建收藏夹"
          onChange={event => setName(event.target.value)}
        />
        <Button
          type="submit"
          size="icon"
          variant="secondary"
          aria-label="新建"
          disabled={!name.trim()}
        >
          <PlusIcon />
        </Button>
      </form>
    </>
  )
}
