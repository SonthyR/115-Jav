import { useQueryClient } from '@tanstack/react-query'
import Hls from 'hls.js'
import { LoaderCircleIcon } from 'lucide-react'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
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
import { MovieDetailDialogContext } from '@/features/movie-detail/dialog-context'
import { usePlaylist } from './playlist'
import { PlayerToolbar, type PlayerTrack } from './toolbar'

// Progress is saved this often while playing, and on pause and exit.
const saveInterval = 10_000
// Positions this close to either end are not worth resuming.
const resumeMargin = 10

export function MoviePlayer({ movieId }: { movieId: number }) {
  const info = usePlayInfo(movieId)
  if (info.isPending) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-2xl bg-black">
        <LoaderCircleIcon className="size-8 animate-spin text-white/70" />
      </div>
    )
  }
  if (!info.data) {
    return (
      <ErrorState
        message={describeApiError(info.error)}
        onRetry={() => void info.refetch()}
        retrying={info.isFetching}
      />
    )
  }
  if (info.data.files.length === 0) {
    return <ErrorState message="这部影片没有可播放的 115 视频" />
  }
  return <Player movieId={movieId} info={info.data} />
}

type Mode = 'direct' | TranscodeSource

function Player({ movieId, info }: { movieId: number; info: PlayInfo }) {
  const queryClient = useQueryClient()
  const openMovie = useContext(MovieDetailDialogContext)
  const videoRef = useRef<HTMLVideoElement>(null)
  const resumed = info.files.findIndex(item => item.file_id === info.progress?.file_id)
  const [fileIndex, setFileIndex] = useState(Math.max(resumed, 0))
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
  const startAt = useRef(resumed >= 0 ? (info.progress?.position ?? 0) : 0)
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

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <style>{`.miyabi-player::cue{font-size:${style.size}%;color:${style.color};background:rgba(0,0,0,${style.background})}`}</style>
        <video
          ref={videoRef}
          className="miyabi-player aspect-video w-full bg-black"
          controls
          playsInline
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
          onPause={save}
          onEnded={event => {
            if (fileIndex + 1 < info.files.length) {
              selectFile(fileIndex + 1)
              return
            }
            lastSaved.current = Date.now()
            void clearProgress(movieId).catch(() => undefined)
            const next = usePlaylist.getState().next(movieId)
            if (next !== undefined) {
              openMovie?.(
                { libraryId: next, play: true },
                event.currentTarget.parentElement as HTMLDivElement
              )
            }
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
        {failure ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white">
            {failure}
          </div>
        ) : null}
      </div>
      <PlayerToolbar
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
