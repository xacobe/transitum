import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useFavoritesStore } from './favorites'

describe('useFavoritesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  describe('stops', () => {
    it('toggleFavorite adds then removes a stop', () => {
      const store = useFavoritesStore()
      const stop = { id: 'bilbao:1', name: 'Plaza Nueva', city: 'bilbao', lineCount: 2 }
      store.toggleFavorite(stop)
      expect(store.isFavorite('bilbao:1')).toBe(true)
      store.toggleFavorite(stop)
      expect(store.isFavorite('bilbao:1')).toBe(false)
    })

    it('persists stops to localStorage', () => {
      const store = useFavoritesStore()
      store.toggleFavorite({ id: 'bilbao:1', name: 'Plaza Nueva', city: 'bilbao', lineCount: 2 })
      const persisted = JSON.parse(localStorage.getItem('transit_favorites') ?? '[]')
      expect(persisted).toHaveLength(1)
      expect(persisted[0].id).toBe('bilbao:1')
    })

    it('init() migrates a pre-city-field entry by deriving city from the id prefix', () => {
      localStorage.setItem(
        'transit_favorites',
        JSON.stringify([{ id: 'bilbao:1', name: 'Plaza Nueva', lineCount: 2 }]),
      )
      const store = useFavoritesStore()
      store.init()
      expect(store.favorites[0].city).toBe('bilbao')
    })

    it('init() leaves an entry that already has a city field untouched', () => {
      localStorage.setItem(
        'transit_favorites',
        JSON.stringify([{ id: 'bilbao:1', name: 'Plaza Nueva', city: 'bilbao', lineCount: 2 }]),
      )
      const store = useFavoritesStore()
      store.init()
      expect(store.favorites[0].city).toBe('bilbao')
    })
  })

  describe('routes', () => {
    it('is keyed by origin + destination + line sequence, not origin/destination alone', () => {
      const store = useFavoritesStore()
      const base = { fromName: 'A', fromLat: 1, fromLon: 1, toName: 'B', toLat: 2, toLon: 2, city: 'bilbao' }
      store.toggleFavoriteRoute({ ...base, lines: ['23'] })
      // Same origin/destination, different line sequence - a different alternative.
      expect(store.isFavoriteRoute('A', 'B', ['23'], 'bilbao')).toBe(true)
      expect(store.isFavoriteRoute('A', 'B', ['45'], 'bilbao')).toBe(false)
    })

    it('toggleFavoriteRoute removes an already-favorited route', () => {
      const store = useFavoritesStore()
      const route = { fromName: 'A', fromLat: 1, fromLon: 1, toName: 'B', toLat: 2, toLon: 2, city: 'bilbao', lines: ['23'] }
      store.toggleFavoriteRoute(route)
      store.toggleFavoriteRoute(route)
      expect(store.isFavoriteRoute('A', 'B', ['23'], 'bilbao')).toBe(false)
    })
  })

  describe('lines', () => {
    it('isFavoriteLine matches by shortName+city when the stored entry has no agencyId (legacy entries)', () => {
      const store = useFavoritesStore()
      store.toggleFavoriteLine({ shortName: '23', longName: 'Line 23', city: 'bilbao' })
      expect(store.isFavoriteLine('ANY_AGENCY', '23', 'bilbao')).toBe(true)
      expect(store.isFavoriteLine(undefined, '23', 'bilbao')).toBe(true)
    })

    it('isFavoriteLine requires a matching agencyId once the stored entry has one', () => {
      const store = useFavoritesStore()
      store.toggleFavoriteLine({ shortName: '23', longName: 'Line 23', city: 'bilbao', agencyId: 'BILBOBUS' })
      expect(store.isFavoriteLine('BILBOBUS', '23', 'bilbao')).toBe(true)
      expect(store.isFavoriteLine('OTHER_AGENCY', '23', 'bilbao')).toBe(false)
    })

    it('does not match a line with the same shortName in a different city', () => {
      const store = useFavoritesStore()
      store.toggleFavoriteLine({ shortName: '23', longName: 'Line 23', city: 'bilbao' })
      expect(store.isFavoriteLine(undefined, '23', 'ouagadougou')).toBe(false)
    })

    it('toggleFavoriteLine removes an already-favorited line', () => {
      const store = useFavoritesStore()
      const line = { shortName: '23', longName: 'Line 23', city: 'bilbao' }
      store.toggleFavoriteLine(line)
      store.toggleFavoriteLine(line)
      expect(store.isFavoriteLine(undefined, '23', 'bilbao')).toBe(false)
    })
  })
})
