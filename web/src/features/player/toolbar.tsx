import {
  CaptionsIcon,
  CheckIcon,
  FileUpIcon,
  GaugeIcon,
  LayersIcon,
  LoaderCircleIcon,
  type LucideIcon,
  MaximizeIcon,
  SearchIcon
} from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import { toast } from 'sonner'

import { describeApiError } from '@/api/client'
import {
  fetchSubtitle,
  searchSubtitles,
  type PlayFile,
  type SubtitleSearchResult,
  type TranscodeSource
} from '@/api/playback'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatSize } from '@/lib/format'
import { subtitleFormat, toVTT } from '@/lib/subtitles'
import { useSubtitleStyle } from '@/stores/subtitle-style'

export type PlayerTrack = { key: string; label: string; src: string; language: string }

const languageLabels: Record<string, string> = { 'zh-CN': '简体', 'zh-TW': '繁体' }

const subtitleColors = ['#ffffff', '#ffe066', '#7dd3fc', '#86efac']

function vttTrack(key: string, label: string, text: string, language = ''): PlayerTrack {
  const src = URL.createObjectURL(new Blob([text], { type: 'text/vtt' }))
  return { key, label, src, language }
}

const overlayButton =
  'h-9 rounded-full bg-black/45 px-3 text-white backdrop-blur hover:bg-black/70 hover:text-white data-open:bg-black/70 data-open:text-white'

export function PlayerToolbar({
  container,
  movieId,
  files,
  fileIndex,
  onFileChange,
  mode,
  transcodes,
  onLoadTranscodes,
  onModeChange,
  tracks,
  activeTrack,
  onTrackChange,
  onAddTrack,
  onFullscreen
}: {
  container: HTMLElement | null
  movieId: number
  files: PlayFile[]
  fileIndex: number
  onFileChange: (index: number) => void
  mode: 'direct' | TranscodeSource
  transcodes?: TranscodeSource[]
  onLoadTranscodes: () => Promise<TranscodeSource[]>
  onModeChange: (mode: 'direct' | TranscodeSource) => void
  tracks: PlayerTrack[]
  activeTrack?: string
  onTrackChange: (key?: string) => void
  onAddTrack: (track: PlayerTrack) => void
  onFullscreen: () => void
}) {
  const qualities: Array<'direct' | TranscodeSource> = ['direct', ...(transcodes ?? [])]
  if (mode !== 'direct' && !transcodes?.includes(mode)) qualities.push(mode)
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {files.length > 1 ? (
        <OverlayMenu
          container={container}
          label={`${fileIndex + 1}/${files.length}`}
          icon={LayersIcon}
        >
          {close =>
            files.map((item, index) => (
              <MenuOption
                key={item.file_id}
                active={index === fileIndex}
                label={item.name}
                detail={formatSize(item.size)}
                onSelect={() => {
                  close()
                  onFileChange(index)
                }}
              />
            ))
          }
        </OverlayMenu>
      ) : null}
      <OverlayMenu
        container={container}
        label={mode === 'direct' ? '原画' : `${mode.height}P`}
        icon={GaugeIcon}
        onOpen={() => {
          if (!transcodes) {
            onLoadTranscodes().catch(error =>
              toast.error(`没有可用的转码版本：${describeApiError(error)}`)
            )
          }
        }}
      >
        {close =>
          qualities.map(item => (
            <MenuOption
              key={item === 'direct' ? 'direct' : item.height}
              active={item === mode}
              label={item === 'direct' ? '原画直连' : `115 转码 ${item.height}P`}
              onSelect={() => {
                close()
                onModeChange(item)
              }}
            />
          ))
        }
      </OverlayMenu>
      <SubtitleMenu
        container={container}
        movieId={movieId}
        tracks={tracks}
        activeTrack={activeTrack}
        onTrackChange={onTrackChange}
        onAddTrack={onAddTrack}
      />
      <Button
        variant="ghost"
        size="icon"
        className={overlayButton + ' w-9 px-0'}
        aria-label="全屏"
        onClick={onFullscreen}
      >
        <MaximizeIcon />
      </Button>
    </div>
  )
}

function OverlayMenu({
  container,
  label,
  icon: Icon,
  onOpen,
  children
}: {
  container: HTMLElement | null
  label: string
  icon: LucideIcon
  onOpen?: () => void
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (next) onOpen?.()
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" className={overlayButton}>
          <Icon data-icon="inline-start" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        align="end"
        className="max-h-[60dvh] w-[min(20rem,calc(100vw-1rem))] overflow-y-auto p-1.5"
      >
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  )
}

function MenuOption({
  active,
  label,
  detail,
  onSelect
}: {
  active: boolean
  label: string
  detail?: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-muted ${active ? 'bg-muted font-medium' : ''}`}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail ? <span className="shrink-0 text-xs text-muted-foreground">{detail}</span> : null}
      {active ? <CheckIcon className="size-4 shrink-0 text-primary" /> : null}
    </button>
  )
}

function SubtitleMenu({
  container,
  movieId,
  tracks,
  activeTrack,
  onTrackChange,
  onAddTrack
}: {
  container: HTMLElement | null
  movieId: number
  tracks: PlayerTrack[]
  activeTrack?: string
  onTrackChange: (key?: string) => void
  onAddTrack: (track: PlayerTrack) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [results, setResults] = useState<SubtitleSearchResult[]>()
  const [searching, setSearching] = useState(false)
  const [loading, setLoading] = useState<number>()
  const style = useSubtitleStyle()

  const search = async () => {
    setSearching(true)
    try {
      setResults(await searchSubtitles(movieId))
    } catch (error) {
      toast.error(`搜索字幕失败：${describeApiError(error)}`)
    } finally {
      setSearching(false)
    }
  }

  const load = async (result: SubtitleSearchResult) => {
    setLoading(result.index)
    try {
      const text = await fetchSubtitle(movieId, result.index)
      onAddTrack(
        vttTrack(`online:${result.provider}:${result.index}`, result.name, text, result.language)
      )
    } catch (error) {
      toast.error(describeApiError(error))
    } finally {
      setLoading(undefined)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className={overlayButton}>
          <CaptionsIcon data-icon="inline-start" />
          字幕
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        align="end"
        className="max-h-[70dvh] w-[min(22rem,calc(100vw-2rem))] space-y-4 overflow-y-auto"
      >
        <div className="space-y-1">
          <TrackOption label="关闭字幕" active={!activeTrack} onSelect={() => onTrackChange()} />
          {tracks.map(track => (
            <TrackOption
              key={track.key}
              label={`${languageLabels[track.language] ? `${languageLabels[track.language]} · ` : ''}${track.label}`}
              active={track.key === activeTrack}
              onSelect={() => onTrackChange(track.key)}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            disabled={searching}
            onClick={() => void search()}
          >
            {searching ? <LoaderCircleIcon className="animate-spin" /> : <SearchIcon />}
            在线搜索
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={() => fileInput.current?.click()}
          >
            <FileUpIcon />
            本地字幕
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".srt,.ass,.ssa,.vtt"
            className="hidden"
            onChange={async event => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              const text = toVTT(await file.text(), subtitleFormat(file.name))
              onAddTrack(vttTrack(`local:${file.name}:${Date.now()}`, file.name, text))
            }}
          />
        </div>

        {results ? (
          results.length === 0 ? (
            <p className="text-muted-foreground">没有找到这部影片的在线字幕</p>
          ) : (
            <div className="space-y-1">
              {results.map(result => (
                <button
                  key={result.index}
                  type="button"
                  disabled={loading !== undefined}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted disabled:opacity-60"
                  onClick={() => void load(result)}
                >
                  <span className="min-w-0 flex-1 truncate">{result.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {languageLabels[result.language] ?? ''} {result.provider}
                  </span>
                  {loading === result.index ? (
                    <LoaderCircleIcon className="size-4 animate-spin" />
                  ) : null}
                </button>
              ))}
            </div>
          )
        ) : null}

        <div className="space-y-3 border-t pt-3">
          <StyleRange
            label="字号"
            value={style.size}
            min={50}
            max={250}
            step={10}
            suffix="%"
            onChange={size => style.update({ size })}
          />
          <StyleRange
            label="背景"
            value={Math.round(style.background * 100)}
            min={0}
            max={100}
            step={10}
            suffix="%"
            onChange={background => style.update({ background: background / 100 })}
          />
          <StyleRange
            label="离底部"
            value={style.offset}
            min={0}
            max={40}
            step={2}
            suffix="%"
            onChange={offset => style.update({ offset })}
          />
          <div className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-muted-foreground">颜色</span>
            {subtitleColors.map(color => (
              <button
                key={color}
                type="button"
                aria-label={color}
                className="size-6 rounded-full ring-2 ring-offset-2 ring-offset-popover"
                style={{
                  background: color,
                  ['--tw-ring-color' as string]:
                    style.color === color ? 'var(--primary)' : 'transparent'
                }}
                onClick={() => style.update({ color })}
              />
            ))}
            <Button variant="ghost" size="xs" className="ml-auto" onClick={style.reset}>
              恢复默认
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function TrackOption({
  label,
  active,
  onSelect
}: {
  label: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className={`flex w-full items-center rounded-lg px-2 py-1.5 text-left hover:bg-muted ${active ? 'bg-muted font-medium' : ''}`}
      onClick={onSelect}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <span className="text-xs text-primary">使用中</span> : null}
    </button>
  )
}

function StyleRange({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (value: number) => void
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        className="min-w-0 flex-1 accent-primary"
        onChange={event => onChange(Number(event.target.value))}
      />
      <span className="w-12 shrink-0 text-right tabular-nums">
        {value}
        {suffix}
      </span>
    </label>
  )
}
