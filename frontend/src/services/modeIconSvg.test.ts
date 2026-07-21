import { describe, it, expect } from 'vitest'
import {
  pickStopIconMode,
  METRO_ICON_INNER_SVG,
  TRAM_ICON_INNER_SVG,
} from './modeIconSvg'

describe('pickStopIconMode', () => {
  it('defaults to bus when modes are undefined or empty', () => {
    expect(pickStopIconMode(undefined)).toBe('bus')
    expect(pickStopIconMode([])).toBe('bus')
  })

  it('returns the sole mode when only one is present', () => {
    expect(pickStopIconMode(['ferry'])).toBe('ferry')
    expect(pickStopIconMode(['bus'])).toBe('bus')
  })

  it('prefers the rarer/more distinctive mode over bus', () => {
    expect(pickStopIconMode(['bus', 'metro'])).toBe('metro')
    expect(pickStopIconMode(['bus', 'tram'])).toBe('tram')
    expect(pickStopIconMode(['bus', 'rail', 'metro'])).toBe('rail')
  })

  it('is independent of the input ordering', () => {
    expect(pickStopIconMode(['metro', 'bus'])).toBe('metro')
    expect(pickStopIconMode(['bus', 'metro'])).toBe('metro')
  })

  it('falls back to bus for an unknown mode', () => {
    // 'walk' is not a real stop mode and not in the priority list.
    expect(pickStopIconMode(['walk' as never])).toBe('bus')
  })
})

describe('mode inner-SVG constants', () => {
  it('contain only inner markup (no wrapping <svg> tag)', () => {
    expect(METRO_ICON_INNER_SVG).not.toContain('<svg')
    expect(TRAM_ICON_INNER_SVG).not.toContain('<svg')
    expect(METRO_ICON_INNER_SVG).toContain('<circle')
    expect(TRAM_ICON_INNER_SVG).toContain('<path')
  })
})
