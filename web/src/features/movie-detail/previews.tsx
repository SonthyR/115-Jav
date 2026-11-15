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
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="movie-previews-title" className="text-sm font-medium tracking-[0.08em]">
          预览图
        </h2>
        <span className="font-mono text-[11px] tracking-[0.06em] text-muted-foreground">
          {images.length} 张 · 点开全屏
        </span>
      </div>
      <div className="-mx-1 flex snap-x [scrollbar-width:none] gap-2.5 overflow-x-auto px-1 pb-2 [&::-webkit-scrollbar]:hidden">
        {images.map((preview, index) => (
          <button
            key={`${preview.original}:${index}`}
            type="button"
            aria-label={`预览图 ${index + 1}`}
            onClick={() => {
              setViewerIndex(index)
              setViewerOpen(true)
            }}
            className="relative aspect-video w-48 shrink-0 cursor-zoom-in snap-start overflow-hidden rounded-lg bg-muted ring-1 ring-border/60 transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
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
