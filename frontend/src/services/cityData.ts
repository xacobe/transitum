import { createCityDataCache } from '@/services/cityDataCache'
import type { Stop, Route, Poi } from '@/types'

// Fetches a static /data JSON file, propagating HTTP failures instead of
// letting a 404/500 fall through to .json() - which would either throw an
// opaque SyntaxError (parsing an HTML error page) or silently resolve to a
// wrong-shaped error body that breaks callers far from the real cause.
async function fetchCityJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export const loadCityStops = createCityDataCache<Stop[]>(
  (slug) => fetchCityJson(`/data/${slug}/stops.json`),
)

export const loadCityRoutes = createCityDataCache<Route[]>(
  (slug) => fetchCityJson(`/data/${slug}/routes.json`),
)

// Same shape as routes.json but without geometry points arrays — used in stop
// detail view so we can list which lines serve a stop without loading large polylines.
export const loadCityRoutesMeta = createCityDataCache<Route[]>(
  (slug) => fetchCityJson(`/data/${slug}/routes-meta.json`),
)

export const loadCityPois = createCityDataCache<Poi[]>(
  (slug) => fetchCityJson(`/data/${slug}/pois.json`),
)
