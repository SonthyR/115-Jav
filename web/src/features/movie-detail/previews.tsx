import { useState } from 'react'

import type { PreviewImage } from '@/api/discover'
import { MediaImage } from '@/components/media-image'
import { MoviePreviewViewer } from './preview-viewer'

// A strip of small previews; a click opens them full screen.
export function MoviePreviews({ images }: { images: PreviewImage[] }) {
  // The viewer stays mounted so its closing animation can play; the index outlives `open`.
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)
  if (images.length === 0) return null

  return (
    <section className="space-y-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="movie-previews-title" className="text-lg font-medium tracking-wide">
          预览图
        </h2>
        <span className="text-[13px] tracking-wide text-muted-foreground">
          {images.length} 张 · 点开全屏看
        </span>
      </div>
      <div className="-mx-4 flex snap-x scroll-px-4 [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-2">
        {images.map((preview, index) => (
          <button
            key={`${preview.original}:${index}`}
            type="button"
            aria-label={`预览图 ${index + 1}`}
            onClick={() => {
              setViewerIndex(index)
              setViewerOpen(true)
            }}
            className="relative aspect-video w-48 shrink-0 cursor-zoom-in snap-start overflow-hidden rounded-md bg-muted transition hover:brightness-110 sm:w-56"
          >
            <MediaImage
              source={preview.thumbnail || preview.original}
              original={preview.original}
              className="object-cover"
            />
          </button>
        ))}
      </div>
      <MoviePreviewViewer
        images={images}
        index={viewerIndex}
        open={viewerOpen}
        onIndexChange={setViewerIndex}
        onClose={() => setViewerOpen(false)}
      />
    </section>
  )
}
