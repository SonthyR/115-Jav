import { MediaImage } from '@/components/media-image'

export function MovieCover({
  source,
  width,
  loading = 'lazy',
  onReady
}: {
  source: string
  width?: 360 | 720
  loading?: 'eager' | 'lazy'
  onReady?: () => void
}) {
  return (
    <MediaImage
      source={source}
      width={width}
      loading={loading}
      onReady={onReady}
      blurredBackground
      className="object-contain"
    />
  )
}
