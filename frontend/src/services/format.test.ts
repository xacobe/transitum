import { describe, it, expect } from 'vitest'
import {
  formatTime,
  formatDuration,
  formatDistance,
  formatShortDate,
  formatDateTime,
} from './format'

describe('formatTime', () => {
  it('zero-pads hours and minutes from a Date', () => {
    // Local-time components, constructed locally to stay timezone-agnostic.
    expect(formatTime(new Date(2026, 0, 1, 9, 5))).toBe('09:05')
    expect(formatTime(new Date(2026, 0, 1, 23, 59))).toBe('23:59')
    expect(formatTime(new Date(2026, 0, 1, 0, 0))).toBe('00:00')
  })

  it('accepts an epoch-milliseconds number', () => {
    const d = new Date(2026, 5, 15, 14, 30)
    expect(formatTime(d.getTime())).toBe('14:30')
  })
})

describe('formatDuration', () => {
  it('renders sub-hour durations in minutes, rounding seconds', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(59)).toBe('1 min')
    expect(formatDuration(60)).toBe('1 min')
    expect(formatDuration(90)).toBe('2 min')
    expect(formatDuration(59 * 60)).toBe('59 min')
  })

  it('renders whole hours without a minute part', () => {
    expect(formatDuration(60 * 60)).toBe('1h')
    expect(formatDuration(2 * 60 * 60)).toBe('2h')
  })

  it('renders hours and minutes together', () => {
    expect(formatDuration(90 * 60)).toBe('1h 30min')
    expect(formatDuration((2 * 60 + 5) * 60)).toBe('2h 5min')
  })
})

describe('formatDistance', () => {
  it('renders metres below 1 km, rounded', () => {
    expect(formatDistance(0)).toBe('0 m')
    expect(formatDistance(4.4)).toBe('4 m')
    expect(formatDistance(999)).toBe('999 m')
  })

  it('renders kilometres at/above 1 km, one decimal', () => {
    expect(formatDistance(1000)).toBe('1.0 km')
    expect(formatDistance(1540)).toBe('1.5 km')
    expect(formatDistance(12345)).toBe('12.3 km')
  })
})

describe('formatShortDate', () => {
  it('returns empty string for null/undefined/empty input', () => {
    expect(formatShortDate(null, 'en-US')).toBe('')
    expect(formatShortDate(undefined, 'en-US')).toBe('')
    expect(formatShortDate('', 'en-US')).toBe('')
  })

  it('formats a day and short month for the given locale', () => {
    expect(formatShortDate('2026-01-12T00:00:00Z', 'en-US')).toContain('12')
    expect(formatShortDate('2026-01-12T00:00:00Z', 'en-US')).toMatch(/Jan/i)
  })
})

describe('formatDateTime', () => {
  it('returns the fallback for null/undefined/empty input', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('', 'n/a')).toBe('n/a')
  })

  it('produces a non-empty compact date-time for a valid ISO string', () => {
    const out = formatDateTime('2026-01-12T14:30:00Z')
    expect(out).not.toBe('')
    expect(out).toMatch(/\d/)
  })
})
