import { describe, it, expect, afterEach } from 'vitest'
import {
  toLngLat,
  pointsToCoords,
  latLonArrayToBounds,
  cssVar,
  type LatLon,
} from './geometry'

describe('toLngLat', () => {
  it('swaps [lat, lon] to [lon, lat]', () => {
    expect(toLngLat([43.26, -2.93])).toEqual([-2.93, 43.26])
  })
})

describe('pointsToCoords', () => {
  it('converts every point to [lon, lat]', () => {
    const points: LatLon[] = [
      [43.26, -2.93],
      [43.30, -2.99],
    ]
    expect(pointsToCoords(points)).toEqual([
      [-2.93, 43.26],
      [-2.99, 43.30],
    ])
  })

  it('returns an empty array for no points', () => {
    expect(pointsToCoords([])).toEqual([])
  })
})

describe('latLonArrayToBounds', () => {
  it('returns MapLibre [[minLon, minLat], [maxLon, maxLat]]', () => {
    const points: LatLon[] = [
      [43.26, -2.93],
      [43.30, -2.99],
      [43.25, -2.90],
    ]
    expect(latLonArrayToBounds(points)).toEqual([
      [-2.99, 43.25],
      [-2.90, 43.30],
    ])
  })
})

describe('cssVar', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--test-color')
  })

  it('reads a custom property off :root and trims it', () => {
    document.documentElement.style.setProperty('--test-color', '  #0a5c3f  ')
    expect(cssVar('--test-color')).toBe('#0a5c3f')
  })

  it('returns an empty string for an unset property', () => {
    expect(cssVar('--not-defined-anywhere')).toBe('')
  })
})
