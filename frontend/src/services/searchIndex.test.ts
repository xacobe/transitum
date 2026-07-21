import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Stop, Poi } from '@/types'

const stops = vi.hoisted(() => ({ value: [] as Stop[] }))
const pois = vi.hoisted(() => ({ value: [] as Poi[] }))

vi.mock('@/services/cityData', () => ({
  loadCityStops: (_slug: string) => Promise.resolve(stops.value),
  loadCityPois: (_slug: string) => Promise.resolve(pois.value),
}))

import { searchLocal } from './searchIndex'

describe('searchLocal', () => {
  beforeEach(() => {
    stops.value = []
    pois.value = []
  })

  it('returns nothing for a blank query without touching the index', async () => {
    expect(await searchLocal('', 'city-blank')).toEqual([])
    expect(await searchLocal('   ', 'city-blank')).toEqual([])
  })

  it('matches accent-insensitively and maps a stop to the stop icon', async () => {
    stops.value = [{ id: 's1', name: 'Marché Central', lat: 12.3, lon: -1.5 }]
    const res = await searchLocal('marche', 'city-accents')
    expect(res).toHaveLength(1)
    expect(res[0]).toMatchObject({ id: 'stop/s1', name: 'Marché Central', source: 'stop', icon: 'stop' })
  })

  it('deduplicates stops that share a normalized name (one per direction)', async () => {
    stops.value = [
      { id: 'a', name: 'Plaza Nueva', lat: 43.25, lon: -2.92 },
      { id: 'b', name: 'PLAZA NUEVA', lat: 43.25, lon: -2.92 },
    ]
    const res = await searchLocal('plaza', 'city-dedup')
    expect(res).toHaveLength(1)
    expect(res[0].id).toBe('stop/a')
  })

  it('ranks stops above POIs for the same term', async () => {
    stops.value = [{ id: 's', name: 'Hospital', lat: 1, lon: 1 }]
    pois.value = [{ id: 'poi/h', name: 'Hospital', lat: 1, lon: 1, type: 'hospital', tier: 1 }]
    const res = await searchLocal('hospital', 'city-rank')
    expect(res[0].source).toBe('stop')
  })

  it('maps POI types to icons and falls back to place for unknown types', async () => {
    pois.value = [
      { id: 'poi/1', name: 'Central Clinic', lat: 1, lon: 1, type: 'clinic', tier: 1 },
      { id: 'poi/2', name: 'Central Park', lat: 1, lon: 1, type: 'park', tier: 2 },
    ]
    const res = await searchLocal('central', 'city-icons', 10)
    const byId = Object.fromEntries(res.map((r) => [r.id, r.icon]))
    expect(byId['poi/1']).toBe('hospital') // clinic -> hospital
    expect(byId['poi/2']).toBe('place') // park not in TYPE_TO_ICON -> place fallback
  })

  it('honours the result limit', async () => {
    stops.value = Array.from({ length: 10 }, (_, i) => ({
      id: `s${i}`,
      name: `Avenida ${i}`,
      lat: 1,
      lon: 1,
    }))
    const res = await searchLocal('avenida', 'city-limit', 3)
    expect(res).toHaveLength(3)
  })
})
