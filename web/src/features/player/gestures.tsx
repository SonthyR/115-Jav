import { FastForwardIcon, RewindIcon } from 'lucide-react'
import { type PointerEvent, useRef, useState } from 'react'

import type { VideoApi } from './controls'
import { formatTime } from './player'

// Taps or clicks this close together count as a double.
const doubleWindow = 280
// A finger must travel this far sideways before a swipe seeks.
const swipeThreshold = 24
// Swiping across the whole video moves this many seconds.
const swipeRange = 180
const seekStep = 10

type Hint =
  | { kind: 'tap'; side: 'left' | 'right'; seconds: number }
  | { kind: 'swipe'; target: number; delta: number }

// The layer over the picture and under the controls. A mouse click plays or
// pauses and a double click goes fullscreen. A tap shows or hides the
// controls, a double tap on either side skips ten seconds, and a sideways
// swipe scrubs.
export function PlayerSurface({
  api,
  controlsShown,
  onTogglePlay,
  onFullscreen,
  onShowControls,
  onHideControls
}: {
  api: VideoApi
  controlsShown: boolean
  onTogglePlay: () => void
  onFullscreen: () => void
  onShowControls: () => void
  onHideControls: () => void
}) {
  const [hint, setHint] = useState<Hint>()
  const hideTimer = useRef(0)
  const singleTimer = useRef(0)
  const last = useRef({ time: 0, side: 'middle' as Side, streak: 0 })
  const touch = useRef<{ x: number; y: number; start: number; swiping: boolean; target: number }>(
    undefined
  )

  const show = (next: Hint, linger = 700) => {
    setHint(next)
    window.clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setHint(undefined), linger)
  }

  const sideOf = (event: PointerEvent<HTMLDivElement>): Side => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - box.left
    return x < box.width / 3 ? 'left' : x > (box.width * 2) / 3 ? 'right' : 'middle'
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const video = api.element()
    if (event.pointerType === 'mouse' || !video) return
    touch.current = {
      x: event.clientX,
      y: event.clientY,
      start: video.currentTime,
      swiping: false,
      target: video.currentTime
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = touch.current
    const video = api.element()
    if (!current || !video || !Number.isFinite(video.duration)) return
    const dx = event.clientX - current.x
    const dy = event.clientY - current.y
    if (!current.swiping) {
      if (Math.abs(dx) < swipeThreshold || Math.abs(dx) < Math.abs(dy) * 1.5) return
      current.swiping = true
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const width = event.currentTarget.getBoundingClientRect().width || 1
    const target = Math.min(video.duration, Math.max(0, current.start + (dx / width) * swipeRange))
    current.target = target
    show({ kind: 'swipe', target, delta: target - current.start }, 60_000)
  }

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = touch.current
    touch.current = undefined
    if (current?.swiping) {
      api.seekTo(current.target)
      show({ kind: 'swipe', target: current.target, delta: current.target - current.start }, 500)
      return
    }
    const side = event.pointerType === 'mouse' ? 'middle' : sideOf(event)
    const now = Date.now()
    const double = now - last.current.time < doubleWindow && last.current.side === side
    window.clearTimeout(singleTimer.current)

    if (event.pointerType === 'mouse') {
      if (event.button !== 0) return
      last.current = { time: now, side, streak: 0 }
      if (double) {
        last.current.time = 0
        onFullscreen()
        return
      }
      // Waits a moment so a double click does not also pause.
      singleTimer.current = window.setTimeout(onTogglePlay, doubleWindow)
      return
    }

    if (double && side !== 'middle') {
      const streak = last.current.streak + 1
      api.seekBy(side === 'left' ? -seekStep : seekStep)
      show({ kind: 'tap', side, seconds: streak * seekStep })
      // Further quick taps keep adding ten seconds.
      last.current = { time: now, side, streak }
      return
    }
    if (double) {
      last.current.time = 0
      onTogglePlay()
      return
    }
    last.current = { time: now, side, streak: 0 }
    const shown = controlsShown
    singleTimer.current = window.setTimeout(shown ? onHideControls : onShowControls, doubleWindow)
  }

  return (
    <div
      className="absolute inset-0 touch-pan-y select-none"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (touch.current = undefined)}
    >
      {hint ? <HintView hint={hint} /> : null}
    </div>
  )
}

type Side = 'left' | 'right' | 'middle'

function HintView({ hint }: { hint: Hint }) {
  if (hint.kind === 'swipe') {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p className="rounded-xl bg-black/65 px-4 py-2 text-center text-white tabular-nums">
          <span className="block text-2xl font-semibold">{formatTime(hint.target)}</span>
          <span className="text-sm text-white/75">
            {hint.delta >= 0 ? '+' : '-'}
            {formatTime(Math.abs(hint.delta))}
          </span>
        </p>
      </div>
    )
  }
  const Icon = hint.side === 'left' ? RewindIcon : FastForwardIcon
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 flex w-1/3 items-center justify-center ${hint.side === 'left' ? 'left-0' : 'right-0'}`}
    >
      <p className="flex flex-col items-center gap-1 rounded-full bg-black/55 px-5 py-4 text-sm text-white">
        <Icon className="size-6 fill-current" />
        {hint.seconds} 秒
      </p>
    </div>
  )
}
