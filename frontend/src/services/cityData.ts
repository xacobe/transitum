import { createCityDataCache } from '@/services/cityDataCache'
import type { Stop, Route, Poi } from '@/types'

export const loadCityStops = createCityDataCache<Stop[]>(
  (slug) => fetch(`/data/${slug}/stops.json`).then((r) => r.json()),
)

export const loadCityRoutes = createCityDataCache<Route[]>(
  (slug) => fetch(`/data/${slug}/routes.json`).then((r) => r.json()),
)

// Same shape as routes.json but without geometry points arrays — used in stop
// detail view so we can list which lines serve a stop without loading large polylines.
export const loadCityRoutesMeta = createCityDataCache<Route[]>(
  (slug) => fetch(`/data/${slug}/routes-meta.json`).then((r) => r.json()),
)

export const loadCityPois = createCityDataCache<Poi[]>(
  (slug) => fetch(`/data/${slug}/pois.json`).then((r) => r.json()),
)
