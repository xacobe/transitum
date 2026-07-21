import { describe, it, expect } from 'vitest'
import type { LocationQuery } from 'vue-router'
import type { NamedPosition } from '@/types'
import { buildResultsQuery, parseResultsQuery } from './resultsQuery'

const from: NamedPosition = { lat: 43.26, lon: -2.93, name: 'Plaza Nueva' }
const to: NamedPosition = { lat: 43.30, lon: -2.99, name: 'Deusto' }

describe('buildResultsQuery', () => {
  it('serializes both endpoints', () => {
    expect(buildResultsQuery(from, to)).toEqual({
      fromLat: 43.26,
      fromLon: -2.93,
      fromName: 'Plaza Nueva',
      toLat: 43.30,
      toLon: -2.99,
      toName: 'Deusto',
    })
  })

  it('joins a non-empty lines filter with commas', () => {
    expect(buildResultsQuery(from, to, ['A', 'B', '3']).lines).toBe('A,B,3')
  })

  it('omits the lines key when the filter is empty or undefined', () => {
    expect('lines' in buildResultsQuery(from, to, [])).toBe(false)
    expect('lines' in buildResultsQuery(from, to)).toBe(false)
  })
})

describe('parseResultsQuery', () => {
  it('round-trips a query built by buildResultsQuery', () => {
    const q = buildResultsQuery(from, to, ['A']) as unknown as LocationQuery
    expect(parseResultsQuery(q)).toEqual({
      fromLat: 43.26,
      fromLon: -2.93,
      toLat: 43.30,
      toLon: -2.99,
      fromName: 'Plaza Nueva',
      toName: 'Deusto',
      lines: 'A',
    })
  })

  it('returns null when any coordinate is missing or non-numeric', () => {
    expect(parseResultsQuery({ fromLat: '43.26', fromLon: '-2.93', toLat: '43.30' })).toBeNull()
    expect(
      parseResultsQuery({ fromLat: 'abc', fromLon: '-2.93', toLat: '43.30', toLon: '-2.99' }),
    ).toBeNull()
    expect(parseResultsQuery({})).toBeNull()
  })

  it('falls back to the provided from-name and empty to-name when absent', () => {
    const parsed = parseResultsQuery(
      { fromLat: '1', fromLon: '2', toLat: '3', toLon: '4' },
      'My location',
    )
    expect(parsed).not.toBeNull()
    expect(parsed?.fromName).toBe('My location')
    expect(parsed?.toName).toBe('')
    expect(parsed?.lines).toBeUndefined()
  })
})
