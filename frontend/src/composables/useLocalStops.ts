import { ref } from 'vue'
import { haversineMeters } from '@/services/geo'
import { loadCityStops, loadCityRoutesMeta } from '@/services/cityData'
import { useCityStore } from '@/stores/city'
import type { Route, StopWithDistance } from '@/types'

function buildLinesIndex(routes: Route[]): Map<string, string[]> {
  const index = new Map<string, Set<string>>()
  for (const route of routes) {
    for (const dir of route.directions) {
      for (const stop of dir.stops) {
        if (!index.has(stop.id)) index.set(stop.id, new Set())
        index.get(stop.id)!.add(route.shortName)
      }
    }
  }
  return new Map([...index.entries()].map(([id, set]) => [id, [...set]]))
}

/** Stops near a point, sorted by distance, with the lines that serve each. */
export function useNearbyStops() {
  const city = useCityStore()
  const stops = ref<StopWithDistance[]>([])

  async function fetchNearby(lat: number, lon: number): Promise<void> {
    const radius: number = city.activeCity.nearbyRadiusMeters
    const [stopsData, routesMeta] = await Promise.all([
      loadCityStops(city.activeSlug),
      loadCityRoutesMeta(city.activeSlug).catch(() => [] as Route[]),
    ])
    const linesIndex = buildLinesIndex(routesMeta)
    stops.value = stopsData
      .map((s) => ({
        ...s,
        distanceMeters: haversineMeters(lat, lon, s.lat, s.lon),
        lines: linesIndex.get(s.id),
      }))
      .filter((s) => s.distanceMeters <= radius)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
  }

  return { stops, fetchNearby }
}

