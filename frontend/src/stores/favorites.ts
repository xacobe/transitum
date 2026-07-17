import { defineStore } from 'pinia'
import { track } from '@/composables/useAnalytics'

const STORAGE_KEY = 'transit_favorites'
const ROUTES_STORAGE_KEY = 'transit_favorite_routes'
const LINES_STORAGE_KEY = 'transit_favorite_lines'

export interface FavoriteStop {
  id: string
  name: string
  city: string
  lineCount: number
}

// An itinerary has no id of its own (it changes with every search, even
// for "the same" trip, because the specific times/buses vary) - it's
// identified by origin + destination + the sequence of bus lines used.
// Origin/destination alone is NOT enough: every alternative in the same
// search shares the same origin and destination (that's the definition
// of "alternatives to go from A to B"), so without the lines, favoriting
// one would mark ALL alternatives of that search as favorites.
export interface FavoriteRoute {
  id: string
  city: string
  fromName: string
  fromLat: number
  fromLon: number
  toName: string
  toLat: number
  toLon: number
  lines: string[]
}

export interface FavoriteLine {
  shortName: string
  longName: string
  city: string
  agencyId?: string
}

function routeKey(fromName: string, toName: string, lines: string[], city: string): string {
  return `${city}::${fromName}→${toName}::${(lines ?? []).join(',')}`
}

function save(key: string, data: unknown): void {
  localStorage.setItem(key, JSON.stringify(data))
}

function load<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export const useFavoritesStore = defineStore('favorites', {
  state: (): {
    favorites: FavoriteStop[]
    favoriteRoutes: FavoriteRoute[]
    favoriteLines: FavoriteLine[]
  } => ({
    favorites: [],
    favoriteRoutes: [],
    favoriteLines: [],
  }),
  actions: {
    init(): void {
      // Migration: entries saved before the explicit `city` field existed
      // derive it from the stop id prefix ("<city>:<id>") one last time.
      this.favorites = load<FavoriteStop>(STORAGE_KEY).map((f) =>
        f.city ? f : { ...f, city: f.id.split(':')[0] },
      )
      this.favoriteRoutes = load<FavoriteRoute>(ROUTES_STORAGE_KEY)
      this.favoriteLines = load<FavoriteLine>(LINES_STORAGE_KEY)
    },
    isFavorite(stopId: string): boolean {
      return this.favorites.some((f) => f.id === stopId)
    },
    toggleFavorite(stop: FavoriteStop): void {
      const idx = this.favorites.findIndex((f) => f.id === stop.id)
      if (idx >= 0) {
        this.favorites.splice(idx, 1)
      } else {
        this.favorites.push(stop)
      }
      this.persist()
    },
    removeFavorite(stopId: string): void {
      this.favorites = this.favorites.filter((f) => f.id !== stopId)
      this.persist()
    },
    persist(): void {
      save(STORAGE_KEY, this.favorites)
    },
    isFavoriteRoute(fromName: string, toName: string, lines: string[], city: string): boolean {
      const key = routeKey(fromName, toName, lines, city)
      return this.favoriteRoutes.some((r) => r.id === key)
    },
    toggleFavoriteRoute(route: Omit<FavoriteRoute, 'id'>): void {
      const key = routeKey(route.fromName, route.toName, route.lines, route.city)
      const idx = this.favoriteRoutes.findIndex((r) => r.id === key)
      if (idx >= 0) {
        this.favoriteRoutes.splice(idx, 1)
      } else {
        this.favoriteRoutes.push({ ...route, id: key })
        track('favorite-added', { type: 'route', from: route.fromName, to: route.toName })
      }
      this.persistRoutes()
    },
    removeFavoriteRoute(id: string): void {
      this.favoriteRoutes = this.favoriteRoutes.filter((r) => r.id !== id)
      this.persistRoutes()
    },
    persistRoutes(): void {
      save(ROUTES_STORAGE_KEY, this.favoriteRoutes)
    },
    // Matches by agencyId too once a stored entry has one - older entries
    // saved before agencies existed don't, and are matched by shortName
    // alone (always correct in practice: there's only ever been one
    // agency, so no real entry predates a second one).
    isFavoriteLine(agencyId: string | null | undefined, shortName: string, city: string): boolean {
      return this.favoriteLines.some(
        (l) => l.shortName === shortName && l.city === city && (l.agencyId == null || l.agencyId === agencyId),
      )
    },
    toggleFavoriteLine(line: FavoriteLine): void {
      const idx = this.favoriteLines.findIndex(
        (l) =>
          l.shortName === line.shortName &&
          l.city === line.city &&
          (l.agencyId == null || l.agencyId === line.agencyId),
      )
      if (idx >= 0) {
        this.favoriteLines.splice(idx, 1)
      } else {
        this.favoriteLines.push(line)
        track('favorite-added', { type: 'line', line: line.shortName })
      }
      this.persistLines()
    },
    removeFavoriteLine(agencyId: string | null | undefined, shortName: string, city: string): void {
      this.favoriteLines = this.favoriteLines.filter(
        (l) =>
          !(l.shortName === shortName && l.city === city && (l.agencyId == null || l.agencyId === agencyId)),
      )
      this.persistLines()
    },
    persistLines(): void {
      save(LINES_STORAGE_KEY, this.favoriteLines)
    },
  },
})
