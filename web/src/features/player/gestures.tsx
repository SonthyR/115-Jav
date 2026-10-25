import { FastForwardIcon, RewindIcon } from 'lucide-react'
import { type RefObject, useEffect, useRef, useState } from 'react'

import { formatTime } from './player'

// Taps this close together count as a double tap.
const doubleTapWindow = 300
// A finger must travel this far sideways before a swipe seeks.
const swipeThreshold = 24
// Swiping across the whole video moves this many seconds.
const swipeRange = 180
// The native controls' timeline sits at the bottom; swipes there are left alone.
const controlsHeight = 72
const seekStep = 10

// Chrome on Android already seeks on double taps in its own controls.
const nativeDoubleTap = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

type Hint =
  | { kind: 'tap'; side: 'left' | 'right'; seconds: number }
  | { kind: 'swipe'; target: number; delta: number }

// Touch gestures over the native controls: double tap either side to skip
// ten seconds, swipe sideways to scrub.
export function PlayerGestures({
  video,
  onSeek
}: {
  video: RefObject<HTMLVideoElement | null>
  onSeek: (seconds: number) => void
}) {
  const [hint, setHint] = useState<Hint>()
  const hideTimer = useRef(0)
  const onSeekRef = useRef(onSeek)
  useEffect(() => {
    onSeekRef.current = onSeek
  })

  useEffect(() => {
    const element = video.current
    if (!element) return
    let lastTap = { time: 0, side: 'left' as 'left' | 'right', streak: 0 }
    let touch: { x: number; y: number; start: number; swiping: boolean; target: number } | undefined

    const show = (next: Hint, linger = 700) => {
      setHint(next)
      window.clearTimeout(hideTimer.current)
      hideTimer.current = window.setTimeout(() => setHint(undefined), linger)
    }

    const onStart = (event: TouchEvent) => {
      const point = event.touches[0]
      if (event.touches.length !== 1 || !point) {
        touch = undefined
        return
      }
      const box = element.getBoundingClientRect()
      if (point.clientY > box.bottom - controlsHeight) {
        touch = undefined
        return
      }
      touch = {
        x: point.clientX,
        y: point.clientY,
        start: element.currentTime,
        swiping: false,
        target: element.currentTime
      }
    }

    const onMove = (event: TouchEvent) => {
      const point = event.touches[0]
      if (!touch || !point || !Number.isFinite(element.duration)) return
      const dx = point.clientX - touch.x
      const dy = point.clientY - touch.y
      if (!touch.swiping) {
        if (Math.abs(dx) < swipeThreshold || Math.abs(dx) < Math.abs(dy) * 1.5) return
        touch.swiping = true
      }
      event.preventDefault()
      const width = element.getBoundingClientRect().width || 1
      const target = Math.min(
        element.duration,
        Math.max(0, touch.start + (dx / width) * swipeRange)
      )
      touch.target = target
      show({ kind: 'swipe', target, delta: target - touch.start }, 60_000)
    }

    const onEnd = (event: TouchEvent) => {
      const current = touch
      touch = undefined
      if (!current) return
      if (current.swiping) {
        event.preventDefault()
        element.currentTime = current.target
        show({ kind: 'swipe', target: current.target, delta: current.target - current.start }, 500)
        return
      }
      if (nativeDoubleTap) return
      const box = element.getBoundingClientRect()
      const x = current.x - box.left
      // The middle third is left to play and pause.
      const side = x < box.width / 3 ? 'left' : x > (box.width * 2) / 3 ? 'right' : undefined
      const now = Date.now()
      if (side && now - lastTap.time < doubleTapWindow && lastTap.side === side) {
        event.preventDefault()
        const streak = lastTap.streak + 1
        onSeekRef.current(side === 'left' ? -seekStep : seekStep)
        show({ kind: 'tap', side, seconds: streak * seekStep })
        // Further quick taps keep adding ten seconds.
        lastTap = { time: now, side, streak }
        return
      }
      lastTap = { time: now, side: side ?? 'left', streak: 0 }
    }

    element.addEventListener('touchstart', onStart, { passive: true })
    element.addEventListener('touchmove', onMove, { passive: false })
    element.addEventListener('touchend', onEnd, { passive: false })
    return () => {
      element.removeEventListener('touchstart', onStart)
      element.removeEventListener('touchmove', onMove)
      element.removeEventListener('touchend', onEnd)
      window.clearTimeout(hideTimer.current)
    }
  }, [video])

  if (!hint) return null
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
