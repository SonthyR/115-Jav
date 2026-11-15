import { EyeOffIcon, ImageOffIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { imageURL } from '@/api/client'
import { cn } from 'cn'
import { useSettingsStore } from '@/stores/settings'

type MediaImageProps = {
  source: string
  original?: string
  // Library artwork is sent scaled down to this width.
  width?: 360 | 720
  loading?: 'eager' | 'lazy'
  blurredBackground?: boolean
  onReady?: () => void
  onImageLoad?: (image: HTMLImageElement) => void
  alt?: string
  className?: string
}

export function MediaImage(props: MediaImageProps) {
  const nsfwMode = useSettingsStore(state => state.nsfwMode)
  return (
    <MediaImageContent
      key={JSON.stringify([props.source, props.original, nsfwMode])}
      {...props}
      concealed={nsfwMode}
    />
  )
}

function MediaImageContent({
  source,
  original,
  width,
  loading = 'lazy',
  blurredBackground = false,
  onReady,
  onImageLoad,
  alt = '',
  concealed,
  className
}: MediaImageProps & { concealed: boolean }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const hasSource = source.length > 0
  const showImage = !concealed && hasSource && status !== 'error'
  const ready = !showImage || status === 'ready'

  useEffect(() => {
    if (ready) onReady?.()
  }, [ready, onReady])

  const imageProps = {
    src: imageURL(source, width),
    srcSet: original ? `${imageURL(source, width)} 1x, ${imageURL(original)} 2x` : undefined,
    loading,
    decoding: 'async',
    referrerPolicy: 'no-referrer',
    alt
  } as const

  return (
    <div className="relative size-full overflow-hidden bg-muted">
      {concealed ? (
        <CoverState icon={EyeOffIcon} label="封面已隐藏" />
      ) : !hasSource ? (
        <CoverState icon={ImageOffIcon} label="暂无封面" />
      ) : status === 'error' ? (
        <CoverState icon={ImageOffIcon} label="封面加载失败" />
      ) : status === 'loading' ? (
        <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden="true" />
      ) : null}
      {showImage ? (
        <div className={cn('absolute inset-0', !ready && 'opacity-0')}>
          {blurredBackground ? (
            <img
              {...imageProps}
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full scale-125 object-cover blur-xl brightness-75"
            />
          ) : null}
          <img
            {...imageProps}
            className={cn('relative size-full', className)}
            onLoad={async event => {
              const image = event.currentTarget
              onImageLoad?.(image)
              try {
                if (typeof image.decode === 'function') await image.decode()
                setStatus('ready')
              } catch {
                setStatus('error')
              }
            }}
            onError={() => setStatus('error')}
          />
        </div>
      ) : null}
    </div>
  )
}

function CoverState({ icon: Icon, label }: { icon: typeof EyeOffIcon; label: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden bg-muted px-1 text-muted-foreground">
      <Icon className="size-6 shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span className="max-w-full truncate text-[11px] leading-none">{label}</span>
    </div>
  )
}
