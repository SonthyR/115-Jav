import { ImagesIcon, Maximize2Icon } from 'lucide-react'
import { useState } from 'react'

import type { PreviewImage } from '@/api/discover'
import { MediaImage } from '@/components/media-image'
import { Button } from '@/components/ui/button'
import { MoviePreviewViewer } from './preview-viewer'

export function MoviePreviews({ images }: { images: PreviewImage[] }) {
  // The viewer stays mounted so its closing animation can play; the index outlives `open`.
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  // Previews are large; they load only when asked for, so opening many
  // details does not pile them up in the browser.
  const [shown, setShown] = useState(false)

  const openViewer = (index: number) => {
    setViewerIndex(index)
    setViewerOpen(true)
  }

  return (
    <section className="space-y-4">
      <h2 id="movie-previews-title" className="text-xl font-semibold tracking-normal">
        预览图
      </h2>
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无预览图</p>
      ) : !shown ? (
        <Button variant="outline" onClick={() => setShown(true)}>
          <ImagesIcon data-icon="inline-start" />
          显示预览图（{images.length} 张）
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {images.map((preview, index) => (
            <button
              key={`${preview.original}:${index}`}
              type="button"
              onClick={() => openViewer(index)}
              className="group relative aspect-video cursor-pointer overflow-hidden rounded-xl"
            >
              <MediaImage
                source={preview.thumbnail || preview.original}
                original={preview.original}
                className="object-cover"
              />
              <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
                <Maximize2Icon className="size-5" />
              </span>
            </button>
          ))}
        </div>
      )}
      {shown ? (
        <MoviePreviewViewer
          images={images}
          index={viewerIndex}
          open={viewerOpen}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerOpen(false)}
        />
      ) : null}
    </section>
  )
}
