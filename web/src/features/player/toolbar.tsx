import { CaptionsIcon, FileUpIcon, LoaderCircleIcon, SearchIcon } from 'lucide-react'
import { useRef, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
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

export function PlayerToolbar({
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
  onAddTrack
}: {
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
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {files.length > 1 ? (
        <Select value={String(fileIndex)} onValueChange={value => onFileChange(Number(value))}>
          <SelectTrigger className="max-w-full min-w-0 sm:max-w-80" aria-label="版本与分卷">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {files.map((item, index) => (
              <SelectItem key={item.file_id} value={String(index)}>
                {item.name}（{formatSize(item.size)}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}

      <Select
        value={mode === 'direct' ? 'direct' : String(mode.height)}
        onOpenChange={open => {
          if (open && !transcodes) {
            onLoadTranscodes().catch(error =>
              toast.error(`没有可用的转码版本：${describeApiError(error)}`)
            )
          }
        }}
        onValueChange={value => {
          if (value === 'direct') onModeChange('direct')
          const source = transcodes?.find(item => String(item.height) === value)
          if (source) onModeChange(source)
        }}
      >
        <SelectTrigger aria-label="画质">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="direct">原画直连</SelectItem>
          {mode !== 'direct' && !transcodes?.includes(mode) ? (
            <SelectItem value={String(mode.height)}>转码 {mode.height}P</SelectItem>
          ) : null}
          {transcodes?.map(item => (
            <SelectItem key={item.height} value={String(item.height)}>
              转码 {item.height}P
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <SubtitleMenu
        movieId={movieId}
        tracks={tracks}
        activeTrack={activeTrack}
        onTrackChange={onTrackChange}
        onAddTrack={onAddTrack}
      />
    </div>
  )
}

function SubtitleMenu({
  movieId,
  tracks,
  activeTrack,
  onTrackChange,
  onAddTrack
}: {
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
        <Button variant="outline">
          <CaptionsIcon data-icon="inline-start" />
          字幕
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
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
