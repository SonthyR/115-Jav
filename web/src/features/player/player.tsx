import { useQueryClient } from '@tanstack/react-query'
import Hls from 'hls.js'
import { LoaderCircleIcon } from 'lucide-react'
import { cn } from 'cn'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  clearProgress,
  fetchTranscodes,
  playbackKeys,
  saveProgress,
  saveProgressOnExit,
  streamURL,
  subtitleURL,
  usePlayInfo,
  type PlayInfo,
  type TranscodeSource
} from '@/api/playback'
import { describeApiError } from '@/api/client'
import { ErrorState } from '@/components/error-state'
import { useSubtitleStyle } from '@/stores/subtitle-style'
import { PlayerToolbar, type PlayerTrack } from './toolbar'

// Progress is saved this often while playing, and on pause and exit.
const saveInterval = 10_000
// Positions this close to either end are not worth resuming.
const resumeMargin = 10

type PlayerOptions = {
  // page fills the screen with an overlay; inline sits in a detail.
  variant?: 'inline' | 'page'
  title?: string
  startFile?: string
  // Ignore the saved position and start from the beginning.
  restart?: boolean
  topLeft?: ReactNode
  // Runs when the last video ends, as when a collection plays in order.
  onFinished?: () => void
}

export function MoviePlayer({ movieId, ...options }: { movieId: number } & PlayerOptions) {
  const info = usePlayInfo(movieId)
  if (info.isPending) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-black',
          options.variant === 'page' ? 'h-dvh' : 'aspect-video rounded-2xl'
        )}
      >
        <LoaderCircleIcon className="size-8 animate-spin text-white/70" />
      </div>
    )
  }
  const failure = !info.data
    ? describeApiError(info.error)
    : info.data.files.length === 0
      ? '这部影片没有可播放的 115 视频'
      : undefined
  if (failure || !info.data) {
    const state = (
      <ErrorState
        message={failure ?? ''}
        onRetry={info.data ? undefined : () => void info.refetch()}
        retrying={info.isFetching}
      />
    )
    if (options.variant !== 'page') return state
    return (
      <div className="dark relative flex h-dvh items-center justify-center bg-black p-4 text-foreground">
        <div className="absolute top-3 left-3">{options.topLeft}</div>
        {state}
      </div>
    )
  }
  return <Player movieId={movieId} info={info.data} {...options} />
}

type Mode = 'direct' | TranscodeSource

function Player({
  movieId,
  info,
  variant = 'inline',
  title,
  startFile,
  restart = false,
  topLeft,
  onFinished
}: { movieId: number; info: PlayInfo } & PlayerOptions) {
  const queryClient = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const resumed = info.files.findIndex(item => item.file_id === info.progress?.file_id)
  const requested = info.files.findIndex(item => item.file_id === startFile)
  const [fileIndex, setFileIndex] = useState(requested >= 0 ? requested : Math.max(resumed, 0))
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [idle, setIdle] = useState(false)
  const idleTimer = useRef(0)
  const [mode, setMode] = useState<Mode>('direct')
  const [transcodes, setTranscodes] = useState<TranscodeSource[]>()
  const [failure, setFailure] = useState<string>()
  const [tracks, setTracks] = useState<PlayerTrack[]>(() =>
    info.subtitles.map(item => ({
      key: `saved:${item.id}`,
      label: item.name,
      src: subtitleURL(movieId, item.id),
      language: item.language
    }))
  )
  const [activeTrack, setActiveTrack] = useState<string | undefined>(tracks[0]?.key)
  // MoviePlayer renders the player only for movies with videos.
  const file = info.files[fileIndex] ?? info.files[0]!
  // Where the next loaded source starts: the saved position, or the current
  // time when only the quality changes.
  const startAt = useRef(
    !restart && resumed >= 0 && (requested < 0 || requested === resumed)
      ? (info.progress?.position ?? 0)
      : 0
  )
  const lastSaved = useRef(0)

  const loadTranscodes = useCallback(async () => {
    if (transcodes) return transcodes
    const sources = (await fetchTranscodes(file.file_id)).toSorted((a, b) => b.height - a.height)
    setTranscodes(sources)
    return sources
  }, [file.file_id, transcodes])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    setFailure(undefined)
    let hls: Hls | undefined
    const source = mode === 'direct' ? streamURL(file.file_id) : mode.url
    if (mode !== 'direct' && Hls.isSupported()) {
      hls = new Hls()
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setFailure('115 转码流播放失败，请稍后重试或换一个画质')
      })
      hls.loadSource(source)
      hls.attachMedia(video)
    } else {
      video.src = source
    }
    void video.play().catch(() => undefined)
    return () => {
      hls?.destroy()
      video.removeAttribute('src')
      video.load()
    }
  }, [file.file_id, mode])

  const position = useCallback(() => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration) || video.currentTime < 1) return
    return { file_id: file.file_id, position: video.currentTime, duration: video.duration }
  }, [file.file_id])

  const save = useCallback(() => {
    const progress = position()
    if (!progress) return
    lastSaved.current = Date.now()
    void saveProgress(movieId, progress).catch(() => undefined)
  }, [movieId, position])

  useEffect(() => {
    const exit = () => {
      const progress = position()
      if (progress) saveProgressOnExit(movieId, progress)
    }
    window.addEventListener('pagehide', exit)
    return () => {
      window.removeEventListener('pagehide', exit)
      exit()
      void queryClient.invalidateQueries({ queryKey: playbackKeys.continue })
    }
  }, [movieId, position, queryClient])

  const fallBack = async () => {
    try {
      const [best] = await loadTranscodes()
      if (!best) throw new Error('115 没有返回转码版本')
      startAt.current = videoRef.current?.currentTime || startAt.current
      setMode(best)
      toast.info('浏览器无法直接解码原画，已切换到 115 转码')
    } catch (error) {
      setFailure(
        `浏览器无法播放这个格式，115 也没有转码版本（${describeApiError(error)}），请用 Emby 播放`
      )
    }
  }

  const style = useSubtitleStyle()

  // Native cue rendering keeps subtitles visible in fullscreen; the offset
  // is applied by placing every cue on a line measured from the top.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const apply = () => {
      for (const track of Array.from(video.textTracks)) {
        const key = trackKeys.get(track)
        track.mode = key && key === activeTrack ? 'showing' : 'disabled'
        for (const cue of Array.from(track.cues ?? [])) {
          if (cue instanceof VTTCue) {
            cue.snapToLines = false
            cue.line = 100 - style.offset
          }
        }
      }
    }
    apply()
    const elements = Array.from(video.querySelectorAll('track'))
    for (const element of elements) element.addEventListener('load', apply)
    return () => {
      for (const element of elements) element.removeEventListener('load', apply)
    }
  }, [activeTrack, tracks, style.offset])

  // The overlay hides while playing without pointer movement.
  const wake = () => {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setIdle(true)
    }, 3000)
  }
  useEffect(() => () => window.clearTimeout(idleTimer.current), [])

  const toggleFullscreen = () => {
    const element = containerRef.current
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null
    if (document.fullscreenElement) void document.exitFullscreen()
    else if (element?.requestFullscreen) void element.requestFullscreen()
    // iOS Safari only fullscreens the video element itself.
    else video?.webkitEnterFullscreen?.()
  }

  useEffect(() => {
    if (variant !== 'page') return
    const onKey = (event: KeyboardEvent) => {
      const video = videoRef.current
      const target = event.target as HTMLElement
      if (!video || target.closest('input, textarea, [role=dialog], [data-slot=popover-content]'))
        return
      const actions: Record<string, () => void> = {
        ' ': () => void (video.paused ? video.play() : video.pause()),
        k: () => void (video.paused ? video.play() : video.pause()),
        ArrowLeft: () => (video.currentTime = Math.max(0, video.currentTime - 10)),
        ArrowRight: () => (video.currentTime = video.currentTime + 10),
        ArrowUp: () => (video.volume = Math.min(1, video.volume + 0.1)),
        ArrowDown: () => (video.volume = Math.max(0, video.volume - 0.1)),
        f: toggleFullscreen,
        m: () => (video.muted = !video.muted)
      }
      const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key]
      if (!action || event.ctrlKey || event.metaKey || event.altKey) return
      event.preventDefault()
      action()
      wake()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const page = variant === 'page'
  return (
    <div
      ref={element => {
        containerRef.current = element
        setContainer(element)
      }}
      className={cn(
        'group/player relative overflow-hidden bg-black',
        page ? 'h-dvh w-full' : 'rounded-2xl',
        idle && 'cursor-none'
      )}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <style>{`.miyabi-player::cue{font-size:${style.size}%;color:${style.color};background:rgba(0,0,0,${style.background})}`}</style>
      <video
        ref={videoRef}
        className={cn('miyabi-player w-full bg-black', page ? 'h-full' : 'aspect-video')}
        controls
        controlsList="nofullscreen"
        playsInline
        onDoubleClick={toggleFullscreen}
        onLoadedMetadata={event => {
          const video = event.currentTarget
          const target = startAt.current
          startAt.current = 0
          if (target > resumeMargin && target < video.duration - resumeMargin) {
            video.currentTime = target
            if (mode === 'direct') toast.info(`已从 ${formatTime(target)} 继续播放`)
          }
        }}
        onTimeUpdate={() => {
          if (Date.now() - lastSaved.current > saveInterval) save()
        }}
        onPause={() => {
          save()
          setIdle(false)
        }}
        onPlay={wake}
        onEnded={() => {
          if (fileIndex + 1 < info.files.length) {
            selectFile(fileIndex + 1)
            return
          }
          lastSaved.current = Date.now()
          void clearProgress(movieId).catch(() => undefined)
          onFinished?.()
        }}
        onError={() => {
          if (mode === 'direct') void fallBack()
          else if (!Hls.isSupported()) setFailure('115 转码流播放失败，请稍后重试或换一个画质')
        }}
      >
        {tracks.map(track => (
          <track
            key={track.key}
            ref={element => {
              if (element) trackKeys.set(element.track, track.key)
            }}
            kind="subtitles"
            src={track.src}
            label={track.label}
            srcLang={track.language || 'zh'}
          />
        ))}
      </video>
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 flex items-start gap-2 bg-linear-to-b from-black/75 to-transparent p-2 pb-12 text-white transition-opacity duration-300 sm:p-3',
          idle && 'opacity-0'
        )}
      >
        <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2">
          {topLeft}
          {title ? <p className="truncate text-sm font-medium sm:text-base">{title}</p> : null}
        </div>
        <div className="pointer-events-auto">
          <PlayerToolbar
            container={container}
            movieId={movieId}
            files={info.files}
            fileIndex={fileIndex}
            onFileChange={selectFile}
            mode={mode}
            transcodes={transcodes}
            onLoadTranscodes={loadTranscodes}
            onModeChange={next => {
              startAt.current = videoRef.current?.currentTime ?? 0
              setMode(next)
            }}
            tracks={tracks}
            activeTrack={activeTrack}
            onTrackChange={setActiveTrack}
            onAddTrack={track => {
              setTracks(current => [...current, track])
              setActiveTrack(track.key)
            }}
            onFullscreen={toggleFullscreen}
          />
        </div>
      </div>
      {failure ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white">
          {failure}
        </div>
      ) : null}
    </div>
  )

  function selectFile(index: number) {
    save()
    startAt.current = 0
    setTranscodes(undefined)
    setMode('direct')
    setFileIndex(index)
  }
}

// TextTrack objects carry no React key, so the player maps them back here.
const trackKeys = new WeakMap<TextTrack, string>()

export function formatTime(seconds: number) {
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
