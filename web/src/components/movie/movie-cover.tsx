import { MediaImage } from '@/components/media-image'

export function MovieCover({
  source,
  width,
  loading = 'lazy',
  onReady,
  alt
}: {
  source: string
  width?: 360 | 720
  loading?: 'eager' | 'lazy'
  onReady?: () => void
  alt?: string
}) {
  return (
    <MediaImage
      source={source}
      width={width}
      loading={loading}
      onReady={onReady}
      alt={alt}
      blurredBackground
      className="object-contain"
    />
  )
}
