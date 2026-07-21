import { describe, it, expect } from 'vitest'
import { WALK_MPS, latLonBounds, haversineMeters } from './geo'

describe('WALK_MPS', () => {
  it('is a sensible walking speed constant', () => {
    expect(WALK_MPS).toBe(1.25)
  })
})

describe('latLonBounds', () => {
  it('returns the min/max lat and lon across points', () => {
    const points: [number, number][] = [
      [43.26, -2.93],
      [43.30, -2.99],
      [43.25, -2.90],
    ]
    expect(latLonBounds(points)).toEqual({
      minLat: 43.25,
      maxLat: 43.30,
      minLon: -2.99,
      maxLon: -2.90,
    })
  })

  it('handles a single point (min === max)', () => {
    expect(latLonBounds([[10, 20]])).toEqual({
      minLat: 10,
      maxLat: 10,
      minLon: 20,
      maxLon: 20,
    })
  })
})

describe('haversineMeters', () => {
  it('is zero for identical coordinates', () => {
    expect(haversineMeters(43.26, -2.93, 43.26, -2.93)).toBe(0)
  })

  it('is symmetric', () => {
    const a = haversineMeters(43.26, -2.93, 43.30, -2.99)
    const b = haversineMeters(43.30, -2.99, 43.26, -2.93)
    expect(a).toBeCloseTo(b, 6)
  })

  it('approximates a known distance (~111 km per degree of latitude)', () => {
    const oneDegLat = haversineMeters(0, 0, 1, 0)
    expect(oneDegLat).toBeGreaterThan(110_000)
    expect(oneDegLat).toBeLessThan(112_000)
  })

  it('measures a short intra-city distance within tolerance', () => {
    // Bilbao: two points ~5.6 km apart.
    const d = haversineMeters(43.263, -2.935, 43.30, -2.99)
    expect(d).toBeGreaterThan(5_000)
    expect(d).toBeLessThan(7_000)
  })
})
