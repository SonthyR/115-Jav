import { useQueryClient } from '@tanstack/react-query'
import Hls from 'hls.js'
import { LoaderCircleIcon, PlayIcon, RotateCcwIcon } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { usePlaybackRate } from '@/stores/playback-rate'
import { usePlayerVolume } from '@/stores/player-volume'
import { useSubtitleStyle } from '@/stores/subtitle-style'
import { ControlBar, togglePlay, useVideoState, type VideoApi } from './controls'
import { PlayerSurface } from './gestures'
import { PlayerToolbar, type PlayerTrack } from './toolbar'

// Progress is saved this often while playing, and on pause and exit.
const saveInterval = 10_000
// Positions this close to either end are not worth resuming.
const resumeMargin = 10
// 115 sometimes refuses a freshly added file's link for a moment, so a
// source that fails before loading anything is asked for once more first.
const retryDelay = 3000
const seekStep = 10

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
  // Skips to the next movie of a collection playing in order.
  onNext?: () => void
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
  onFinished,
  onNext
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
  // Bumped to ask the relay for a fresh link to the same source.
  const [attempt, setAttempt] = useState(0)
  const [buffering, setBuffering] = useState(true)
  const [notice, setNotice] = useState<string>()
  const loaded = useRef(false)
  const retried = useRef(false)
  const rate = usePlaybackRate()
  const [tracks, setTracks] = useState<PlayerTrack[]>(() =>
    info.subtitles.map(item => ({
      key: `saved:${item.id}`,
      label: item.name,
      src: subtitleURL(movieId, item.id),
      language: item.language
    }))
  )
  // Subtitles start off; the subtitle menu turns one on.
  const [activeTrack, setActiveTrack] = useState<string>()
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
    setBuffering(true)
    loaded.current = false
    let hls: Hls | undefined
    const source =
      mode === 'direct' ? streamURL(file.file_id) + (attempt ? `?retry=${attempt}` : '') : mode.url
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
  }, [file.file_id, mode, attempt])

  // A new source starts at the default rate, so the chosen one is put back.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.defaultPlaybackRate = rate.rate
    video.playbackRate = rate.rate
  }, [rate.rate, file.file_id, mode, attempt])

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
    setNotice('浏览器无法直接播放原画，正在切换 115 转码…')
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
    } finally {
      setNotice(undefined)
    }
  }

  const retry = () => {
    retried.current = false
    startAt.current = videoRef.current?.currentTime || startAt.current
    setMode('direct')
    setAttempt(value => value + 1)
  }

  const seekBy = (seconds: number) => {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) return
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds))
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

  // The controls hide while playing without pointer movement, unless a menu
  // is open or the pointer rests on them.
  const wake = () => {
    setIdle(false)
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => {
      if (videoRef.current?.paused) return
      if (containerRef.current?.querySelector('[data-slot=popover-content]')) return wake()
      if (containerRef.current?.querySelector('[data-controls]:hover')) return wake()
      setIdle(true)
    }, 3000)
  }
  useEffect(() => () => window.clearTimeout(idleTimer.current), [])

  const [flash, setFlash] = useState<{ text: string; key: number }>()
  const flashTimer = useRef(0)
  const announce = (text: string) => {
    setFlash({ text, key: Date.now() })
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(undefined), 800)
  }
  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  const enterFullscreen = async () => {
    const element = containerRef.current
    const video = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null
    if (element?.requestFullscreen) {
      await element.requestFullscreen()
      // Phones turn sideways for a wide video where the browser allows it.
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: string) => Promise<void>
      }
      if (
        matchMedia('(pointer: coarse)').matches &&
        (video?.videoWidth ?? 1) >= (video?.videoHeight ?? 0)
      )
        await orientation.lock?.('landscape').catch(() => undefined)
    }
    // iOS Safari only fullscreens the video element itself.
    else video?.webkitEnterFullscreen?.()
  }
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void enterFullscreen().catch(() => undefined)
  }

  // Turning a phone sideways while a movie plays fills the screen.
  useEffect(() => {
    if (variant !== 'page' || !matchMedia('(pointer: coarse)').matches) return
    const query = matchMedia('(orientation: landscape)')
    const onChange = () => {
      if (query.matches && !document.fullscreenElement && !videoRef.current?.paused)
        void enterFullscreen().catch(() => undefined)
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  })

  useEffect(() => {
    if (variant !== 'page') return
    const onKey = (event: KeyboardEvent) => {
      const video = videoRef.current
      const target = event.target as HTMLElement
      if (!video || target.closest('input, textarea, [role=dialog], [data-slot=popover-content]'))
        return
      const volume = (delta: number) => {
        video.muted = false
        video.volume = Math.min(1, Math.max(0, Math.round((video.volume + delta) * 20) / 20))
        announce(`音量 ${Math.round(video.volume * 100)}%`)
      }
      const skip = (seconds: number) => {
        seekBy(seconds)
        announce(seconds > 0 ? `前进 ${seconds} 秒` : `后退 ${-seconds} 秒`)
      }
      const speed = (direction: 1 | -1) => {
        rate.step(direction)
        announce(`${usePlaybackRate.getState().rate}×`)
      }
      const actions: Record<string, () => void> = {
        ' ': () => togglePlay(video),
        k: () => togglePlay(video),
        ArrowLeft: () => skip(-seekStep),
        ArrowRight: () => skip(seekStep),
        j: () => skip(-seekStep),
        l: () => skip(seekStep),
        ArrowUp: () => volume(0.05),
        ArrowDown: () => volume(-0.05),
        '<': () => speed(-1),
        '>': () => speed(1),
        n: () => onNext?.(),
        f: toggleFullscreen,
        m: () => {
          video.muted = !video.muted
          announce(video.muted ? '静音' : `音量 ${Math.round(video.volume * 100)}%`)
        }
      }
      const action = actions[event.key.length === 1 ? event.key.toLowerCase() : event.key]
      if (!action || event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'n' && !onNext) return
      event.preventDefault()
      action()
      wake()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const state = useVideoState(videoRef, `${file.file_id}:${attempt}`)
  const volume = usePlayerVolume()
  // Each new source starts at the remembered volume.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = usePlayerVolume.getState().volume
    video.muted = usePlayerVolume.getState().muted
  }, [file.file_id, mode, attempt])
  useEffect(() => {
    if (state.volume !== volume.volume || state.muted !== volume.muted)
      volume.set(state.volume, state.muted)
  }, [state.volume, state.muted, volume])

  const api: VideoApi = {
    element: () => videoRef.current,
    togglePlay: () => togglePlay(videoRef.current),
    seekTo: seconds => {
      if (videoRef.current) videoRef.current.currentTime = seconds
    },
    seekBy,
    setVolume: level => {
      const video = videoRef.current
      if (!video) return
      video.volume = level
      video.muted = level === 0
    },
    toggleMute: () => {
      const video = videoRef.current
      if (!video) return
      video.muted = !video.muted
      if (!video.muted && video.volume === 0) video.volume = 0.5
    },
    togglePictureInPicture: () => {
      const video = videoRef.current
      if (!video) return
      if (document.pictureInPictureElement) void document.exitPictureInPicture()
      else void video.requestPictureInPicture().catch(() => undefined)
    }
  }

  const page = variant === 'page'
  const shown = !idle || state.paused
  const resumeAt =
    info.progress?.file_id === file.file_id && info.progress.position > resumeMargin
      ? info.progress.position
      : undefined
  return (
    <div
      ref={element => {
        containerRef.current = element
        setContainer(element)
      }}
      className={cn(
        'group/player relative overflow-hidden bg-black',
        page ? 'h-dvh w-full' : 'aspect-video rounded-2xl',
        !shown && 'cursor-none'
      )}
      onPointerMove={event => {
        if (event.pointerType === 'mouse') wake()
      }}
    >
      <style>{`.miyabi-player::cue{font-size:${style.size}%;color:${style.color};background:rgba(0,0,0,${style.background})}`}</style>
      <video
        ref={videoRef}
        className="miyabi-player size-full bg-black object-contain"
        playsInline
        onLoadedMetadata={event => {
          loaded.current = true
          retried.current = false
          const video = event.currentTarget
          const target = startAt.current
          startAt.current = 0
          if (target > resumeMargin && target < video.duration - resumeMargin) {
            video.currentTime = target
            if (mode === 'direct') announce(`从 ${formatTime(target)} 继续播放`)
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
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onLoadedData={() => setBuffering(false)}
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
          setBuffering(false)
          if (mode === 'direct' && !loaded.current && !retried.current) {
            retried.current = true
            setNotice('115 暂时没给出播放地址，正在重试…')
            window.setTimeout(() => {
              setNotice(undefined)
              setAttempt(value => value + 1)
            }, retryDelay)
          } else if (mode === 'direct') void fallBack()
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

      <PlayerSurface
        api={api}
        controlsShown={shown}
        onTogglePlay={() => {
          togglePlay(videoRef.current)
          wake()
        }}
        onFullscreen={toggleFullscreen}
        onShowControls={wake}
        onHideControls={() => {
          window.clearTimeout(idleTimer.current)
          if (!videoRef.current?.paused) setIdle(true)
        }}
      />

      {(buffering || notice) && !failure ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-white">
          <LoaderCircleIcon className="size-10 animate-spin text-white/80" />
          {notice ? <p className="rounded-full bg-black/60 px-3 py-1">{notice}</p> : null}
        </div>
      ) : state.paused && !failure && state.duration > 0 ? (
        <button
          type="button"
          aria-label="播放"
          className="absolute top-1/2 left-1/2 flex size-16 -translate-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur transition-transform hover:scale-110 sm:size-20"
          onClick={() => togglePlay(videoRef.current)}
        >
          <PlayIcon className="size-8 translate-x-0.5 fill-current sm:size-10" />
        </button>
      ) : null}

      {flash ? (
        <p
          key={flash.key}
          className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 rounded-full bg-black/65 px-4 py-1.5 text-sm text-white tabular-nums"
        >
          {flash.text}
        </p>
      ) : null}

      <div
        data-controls
        className={cn(
          'absolute inset-x-0 top-0 flex items-center gap-2 bg-linear-to-b from-black/75 to-transparent p-2 pb-10 text-white transition-opacity duration-300 sm:p-3 sm:pb-12',
          !shown && 'pointer-events-none opacity-0'
        )}
      >
        {topLeft}
        {title ? <PlayerTitle title={title} /> : null}
      </div>

      <div
        data-controls
        className={cn(
          'absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/40 to-transparent pt-12 transition-opacity duration-300',
          !shown && 'pointer-events-none opacity-0'
        )}
      >
        <ControlBar
          api={api}
          state={state}
          resumeAt={resumeAt}
          fullscreen={fullscreen}
          onNext={onNext}
          onFullscreen={toggleFullscreen}
          menus={
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
            />
          }
        />
      </div>

      {failure ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center text-sm text-white">
          <p>{failure}</p>
          <Button variant="secondary" size="sm" className="rounded-full" onClick={retry}>
            <RotateCcwIcon data-icon="inline-start" />
            重试
          </Button>
        </div>
      ) : null}
    </div>
  )

  function selectFile(index: number) {
    save()
    retried.current = false
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

// Long titles keep the code and are cut short rather than covering the picture.
function PlayerTitle({ title }: { title: string }) {
  const [code, ...rest] = title.split(' ')
  return (
    <p
      className="min-w-0 flex-1 truncate text-sm sm:max-w-[60%] sm:flex-none sm:text-base"
      title={title}
    >
      <span className="font-semibold">{code}</span>
      {rest.length ? <span className="text-white/80"> {rest.join(' ')}</span> : null}
    </p>
  )
}
