import { describe, expect, it } from 'vitest'

import { toVTT } from '@/lib/subtitles'

describe('toVTT', () => {
  it('converts SRT timings', () => {
    expect(toVTT('1\r\n0:01:02,5 --> 00:01:04,250\r\n你好\r\n', 'srt')).toBe(
      'WEBVTT\n\n1\n00:01:02.500 --> 00:01:04.250\n你好\n'
    )
  })

  it('converts ASS dialogue and drops styling', () => {
    const text =
      '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n' +
      'Dialogue: 0,0:00:01.50,0:00:03.00,Default,,0,0,0,,{\\an8}第一行\\N第二行, 逗号\n'
    expect(toVTT(text, 'ass')).toBe(
      'WEBVTT\n\n00:00:01.500 --> 00:00:03.000\n第一行\n第二行, 逗号\n'
    )
  })
})
