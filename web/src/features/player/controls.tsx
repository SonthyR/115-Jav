import {
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PictureInPicture2Icon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SkipForwardIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon
} from 'lucide-react'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from 'cn'
import { formatTime } from './player'
import { controlButton } from './toolbar'

export type VideoState = {
  paused: boolean
  time: number
  duration: number
  // Where the buffered stretch around the current time ends.
  buffered: number
  volume: number
  muted: boolean
}

// Mirrors the parts of the video element the controls draw.
export function useVideoState(video: RefObject<HTMLVideoElement | null>, source: unknown) {
  const [state, setState] = useState<VideoState>({
    paused: true,
    time: 0,
    duration: 0,
    buffered: 0,
    volume: 1,
    muted: false
  })
  useEffect(() => {
    const element = video.current
    if (!element) return
    const update = () => {
      let buffered = 0
      for (let i = 0; i < element.buffered.length; i++) {
        if (element.buffered.start(i) <= element.currentTime + 1)
          buffered = Math.max(buffered, element.buffered.end(i))
      }
      setState({
        paused: element.paused,
        time: element.currentTime,
        duration: Number.isFinite(element.duration) ? element.duration : 0,
        buffered,
        volume: element.volume,
        muted: element.muted
      })
    }
    const events = [
      'play',
      'pause',
      'timeupdate',
      'durationchange',
      'progress',
      'volumechange',
      'seeking',
      'emptied',
      'loadedmetadata'
    ]
    for (const name of events) element.addEventListener(name, update)
    update()
    return () => {
      for (const name of events) element.removeEventListener(name, update)
    }
  }, [video, source])
  return state
}

// What the controls may do to the video, kept with the player that owns it.
export type VideoApi = {
  element: () => HTMLVideoElement | null
  togglePlay: () => void
  seekTo: (seconds: number) => void
  seekBy: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  togglePictureInPicture: () => void
}

export function togglePlay(video: HTMLVideoElement | null) {
  if (!video) return
  if (video.paused) void video.play().catch(() => undefined)
  else video.pause()
}

// The bottom bar holds every control in one row under the timeline.
export function ControlBar({
  api,
  state,
  resumeAt,
  fullscreen,
  onNext,
  onFullscreen,
  menus
}: {
  api: VideoApi
  state: VideoState
  // The saved position this file was resumed from, marked on the timeline.
  resumeAt?: number
  fullscreen: boolean
  onNext?: () => void
  onFullscreen: () => void
  menus: ReactNode
}) {
  const pip = typeof document !== 'undefined' && document.pictureInPictureEnabled
  return (
    <div className="space-y-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-3">
      <Timeline api={api} state={state} resumeAt={resumeAt} />
      <div className="flex items-center gap-0.5 text-white sm:gap-1">
        <Button
          variant="ghost"
          className={controlButton}
          aria-label={state.paused ? '播放' : '暂停'}
          title={state.paused ? '播放 (空格)' : '暂停 (空格)'}
          onClick={api.togglePlay}
        >
          {state.paused ? (
            <PlayIcon className="size-6 fill-current" />
          ) : (
            <PauseIcon className="size-6 fill-current" />
          )}
        </Button>
        <Button
          variant="ghost"
          className={cn(controlButton, 'hidden sm:inline-flex')}
          aria-label="后退 10 秒"
          title="后退 10 秒 (←)"
          onClick={() => api.seekBy(-10)}
        >
          <RotateCcwIcon />
        </Button>
        <Button
          variant="ghost"
          className={cn(controlButton, 'hidden sm:inline-flex')}
          aria-label="前进 10 秒"
          title="前进 10 秒 (→)"
          onClick={() => api.seekBy(10)}
        >
          <RotateCwIcon />
        </Button>
        {onNext ? (
          <Button
            variant="ghost"
            className={controlButton}
            aria-label="下一部"
            title="下一部 (N)"
            onClick={onNext}
          >
            <SkipForwardIcon className="fill-current" />
          </Button>
        ) : null}
        <Volume api={api} state={state} />
        <span className="ml-1 shrink-0 text-xs text-white/90 tabular-nums sm:ml-2 sm:text-sm">
          {formatTime(state.time)}
          <span className="text-white/50"> / {formatTime(state.duration)}</span>
        </span>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          {menus}
          {pip ? (
            <Button
              variant="ghost"
              className={cn(controlButton, 'hidden sm:inline-flex')}
              aria-label="画中画"
              title="画中画"
              onClick={api.togglePictureInPicture}
            >
              <PictureInPicture2Icon />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            className={controlButton}
            aria-label={fullscreen ? '退出全屏' : '全屏'}
            title={fullscreen ? '退出全屏 (F)' : '全屏 (F)'}
            onClick={onFullscreen}
          >
            {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Hovering shows the time under the pointer; dragging previews the spot
// and seeks once, on release, so 115 is not asked for every step.
function Timeline({
  api,
  state,
  resumeAt
}: {
  api: VideoApi
  state: VideoState
  resumeAt?: number
}) {
  const bar = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number>()
  const [drag, setDrag] = useState<number>()
  const duration = state.duration
  const shown = drag ?? state.time
  const percent = (value: number) => (duration ? `${(value / duration) * 100}%` : '0%')

  const at = (clientX: number) => {
    const box = bar.current?.getBoundingClientRect()
    if (!box || !duration) return 0
    return Math.min(duration, Math.max(0, ((clientX - box.left) / box.width) * duration))
  }

  return (
    <div
      ref={bar}
      role="slider"
      tabIndex={-1}
      aria-label="播放进度"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration)}
      aria-valuenow={Math.round(shown)}
      aria-valuetext={formatTime(shown)}
      className="group/timeline relative flex h-6 cursor-pointer touch-none items-center"
      onPointerMove={event => {
        if (event.pointerType === 'mouse') setHover(at(event.clientX))
        if (drag !== undefined) setDrag(at(event.clientX))
      }}
      onPointerLeave={() => setHover(undefined)}
      onPointerDown={event => {
        if (!duration) return
        event.currentTarget.setPointerCapture(event.pointerId)
        setDrag(at(event.clientX))
      }}
      onPointerUp={event => {
        if (drag === undefined) return
        const target = at(event.clientX)
        setDrag(undefined)
        api.seekTo(target)
      }}
      onPointerCancel={() => setDrag(undefined)}
    >
      <div
        className={cn(
          'relative h-1 w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/timeline:h-1.5',
          drag !== undefined && 'h-1.5'
        )}
      >
        <div
          className="absolute inset-y-0 left-0 bg-white/40"
          style={{ width: percent(state.buffered) }}
        />
        <div className="absolute inset-y-0 left-0 bg-gold" style={{ width: percent(shown) }} />
      </div>
      {resumeAt && duration ? (
        <span
          title={`上次看到 ${formatTime(resumeAt)}`}
          className="pointer-events-none absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300"
          style={{ left: percent(resumeAt) }}
        />
      ) : null}
      <span
        className={cn(
          'pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow transition-transform',
          drag === undefined && 'scale-0 group-hover/timeline:scale-100'
        )}
        style={{ left: percent(shown) }}
      />
      {drag !== undefined || hover !== undefined ? (
        <span
          className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 rounded-md bg-black/80 px-2 py-0.5 text-xs text-white tabular-nums"
          style={{
            left: `clamp(1.5rem, ${percent(drag ?? hover ?? 0)}, calc(100% - 1.5rem))`
          }}
        >
          {formatTime(drag ?? hover ?? 0)}
        </span>
      ) : null}
    </div>
  )
}

function Volume({ api, state }: { api: VideoApi; state: VideoState }) {
  const level = state.muted ? 0 : state.volume
  const Icon = level === 0 ? VolumeXIcon : level < 0.5 ? Volume1Icon : Volume2Icon
  return (
    <div className="group/volume flex items-center">
      <Button
        variant="ghost"
        className={controlButton}
        aria-label={state.muted ? '取消静音' : '静音'}
        title="静音 (M)"
        onClick={api.toggleMute}
      >
        <Icon />
      </Button>
      {/* Phones change volume with their own buttons. */}
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={level}
        aria-label="音量"
        className="hidden h-1 w-0 cursor-pointer accent-white opacity-0 transition-all group-hover/volume:w-20 group-hover/volume:opacity-100 focus-visible:w-20 focus-visible:opacity-100 [@media(hover:hover)]:block"
        onChange={event => api.setVolume(Number(event.target.value))}
      />
    </div>
  )
}
