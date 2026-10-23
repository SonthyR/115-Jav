const timing = /(\d{1,2}:)?(\d{1,2}):(\d{2})[,.](\d{1,3})/g
const assClock = /^(\d+):(\d{2}):(\d{2})[.:](\d{1,3})$/

function stamp(hours: string | undefined, minutes = '0', seconds = '00', fraction = '0') {
  // ASS uses centiseconds, SRT milliseconds.
  const millis = fraction.length === 2 ? `${fraction}0` : fraction.padEnd(3, '0')
  return `${(hours ?? '0').replace(':', '').padStart(2, '0')}:${minutes.padStart(2, '0')}:${seconds}.${millis}`
}

// Converts SRT or ASS text to WebVTT. ASS styling is dropped; the player
// applies its own subtitle style.
export function toVTT(text: string, format: string) {
  text = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  format = format.toLowerCase()
  if (format === 'vtt' || text.startsWith('WEBVTT')) return text
  if (format === 'ass' || format === 'ssa') return assToVTT(text)
  const lines = text
    .split('\n')
    .map(line =>
      line.includes('-->') ? line.replace(timing, (_, h, m, s, f) => stamp(h, m, s, f)) : line
    )
  return `WEBVTT\n\n${lines.join('\n')}`
}

function assToVTT(text: string) {
  let fields = [
    'layer',
    'start',
    'end',
    'style',
    'name',
    'marginl',
    'marginr',
    'marginv',
    'effect',
    'text'
  ]
  let events = false
  const cues: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const lower = line.toLowerCase()
    if (line.startsWith('[')) {
      events = lower === '[events]'
    } else if (events && lower.startsWith('format:')) {
      fields = lower.slice(7).replace(/\s/g, '').split(',')
    } else if (events && lower.startsWith('dialogue:')) {
      const values = line.slice(9).split(',')
      if (values.length < fields.length) continue
      const body = values
        .slice(fields.length - 1)
        .join(',')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\[Nn]/g, '\n')
        .replace(/\\h/g, ' ')
        .trim()
      const start = assClock.exec(values[fields.indexOf('start')]?.trim() ?? '')
      const end = assClock.exec(values[fields.indexOf('end')]?.trim() ?? '')
      if (!start || !end || !body) continue
      cues.push(
        `${stamp(start[1], start[2], start[3], start[4])} --> ${stamp(end[1], end[2], end[3], end[4])}\n${body}`
      )
    }
  }
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

export function subtitleFormat(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? 'srt'
}
