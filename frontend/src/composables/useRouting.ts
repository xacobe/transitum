import { ref } from 'vue'
import { fetchRoutingPlan } from '@/services/routingClient'
import { loadCityStops, loadCityRoutes, loadCityRoutesMeta } from '@/services/cityData'
import { useFrequency, findPeriodAt } from '@/composables/useFrequency'
import { lineKey } from '@/composables/useAgencies'
import { track } from '@/composables/useAnalytics'
import { useCityStore } from '@/stores/city'
import { getOfflineRouter, type OfflineRouter } from '@/services/offlineRouter'
import { haversineMeters, WALK_MPS } from '@/services/geo'
import type {
  Stop, Route, MapLeg, Itinerary, Reliability,
  StopLine, NearbyStop, StopDetail, RoutingParams,
} from '@/types'

// ── Walking geometry (OSRM foot) ───────────────────────────────────────────

const OSRM_FOOT = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'

async function fetchWalkGeometry(
  fromLat: number, fromLon: number,
  toLat: number, toLon: number,
): Promise<[number, number][] | null> {
  try {
    const url = `${OSRM_FOOT}/${fromLon},${fromLat};${toLon},${toLat}?overview=full&geometries=geojson`
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const data = await res.json() as {
      routes?: Array<{ geometry?: { coordinates?: number[][] } }>
    }
    const coords = data.routes?.[0]?.geometry?.coordinates
    if (!coords?.length) return null
    return coords.map(([lon, lat]) => [lat, lon] as [number, number])
  } catch {
    return null
  }
}

// Replaces straight-line WALK mapLegs (2 points) with road-following geometry.
// Deduplicates identical walk segments across itineraries; falls back to the
// straight line silently if OSRM is unreachable.
async function enrichWalkLegs(itineraries: Itinerary[]): Promise<void> {
  const cache = new Map<string, [number, number][] | null>()
  const promises: Promise<void>[] = []

  for (const it of itineraries) {
    for (const leg of (it.mapLegs ?? [])) {
      if (leg.mode !== 'WALK' || leg.points.length !== 2) continue
      const [from, to] = leg.points
      if (from[0] === to[0] && from[1] === to[1]) continue
      const key = `${from[0]},${from[1]};${to[0]},${to[1]}`
      if (!cache.has(key)) {
        cache.set(key, null)
        promises.push(
          fetchWalkGeometry(from[0], from[1], to[0], to[1]).then((pts) => {
            if (pts) cache.set(key, pts)
          }),
        )
      }
    }
  }

  await Promise.all(promises)

  for (const it of itineraries) {
    for (const leg of (it.mapLegs ?? [])) {
      if (leg.mode !== 'WALK' || leg.points.length !== 2) continue
      const [from, to] = leg.points
      const key = `${from[0]},${from[1]};${to[0]},${to[1]}`
      const pts = cache.get(key)
      if (pts) leg.points = pts
    }
  }
}

const NEARBY_STOP_MAX_M = 250   // max walking distance to show as a nearby transfer stop
const NEARBY_STOP_MAX_N = 5     // max number of nearby stops to show

// ── Stop detail: always read from local static data ───────────────────────
// Both stops.json and routes-meta.json are served as static files under
// /data/. routes-meta.json has the same structure as routes.json but without
// the points geometry arrays — StopView only needs stop IDs/names to list
// which lines serve a stop, never the polylines.
async function fetchStopFromData(
  stopId: string,
  citySlug: string,
  headwayMin: number | null,
  reliability: Reliability | null,
): Promise<StopDetail | null> {
  const [stopsData, routesData]: [Stop[], Route[]] = await Promise.all([
    loadCityStops(citySlug),
    loadCityRoutesMeta(citySlug),
  ])

  const stopInfo = stopsData.find((s) => s.id === stopId)
  if (!stopInfo) return null

  const matchingLines = new Map<string, StopLine>()
  for (const route of routesData) {
    for (const dir of route.directions) {
      const stopIdx = dir.stops.findIndex((s) => s.id === stopId)
      if (stopIdx === -1) continue
      // The last stop of a direction is where that direction's trips end -
      // nowhere to ride onward to from here. Common at a shared terminus
      // (the same physical stop is the last stop of one direction and the
      // first stop of the other, e.g. a line's own turnaround point), which
      // would otherwise list the same line twice at that one stop: once for
      // the direction you can actually board, once for the one that just
      // dropped you off there. Doesn't affect an ordinary stop, which is
      // never any direction's last stop to begin with.
      if (stopIdx === dir.stops.length - 1) continue
      const key = `${lineKey(route.agencyId, route.shortName)}:${dir.headsign ?? ''}`
      // Prefer this line's own computed headway (real per-line data, see
      // RouteDirection.frequencyPeriods) over the city-wide default -
      // falls back to it when this line/band has no computed period
      // (e.g. too few trips to get a meaningful median).
      const ownPeriod = dir.frequencyPeriods?.length ? findPeriodAt(dir.frequencyPeriods) : null
      matchingLines.set(key, {
        shortName: route.shortName,
        longName: route.longName,
        headsign: dir.headsign,
        agencyId: route.agencyId,
        agencyName: route.agencyName,
        headwayMin: ownPeriod ? Math.round(ownPeriod.headwaySeconds / 60) : headwayMin,
        reliability: ownPeriod?.reliability ?? reliability,
        hasFixedSchedule: dir.hasFixedSchedule ?? false,
      })
    }
  }

  // Nearby stops reachable on foot — useful for discovering transfer options.
  const nearbyStops: NearbyStop[] = (stopInfo.lat != null && stopInfo.lon != null)
    ? stopsData
        .filter((s) => s.id !== stopId && s.lat != null && s.lon != null)
        .map((s) => {
          const distanceM = Math.round(haversineMeters(stopInfo.lat, stopInfo.lon, s.lat, s.lon))
          return {
            id: s.id,
            name: s.name,
            lat: s.lat,
            lon: s.lon,
            distanceM,
            walkMin: Math.max(1, Math.round(distanceM / WALK_MPS / 60)),
          }
        })
        .filter((s) => s.distanceM <= NEARBY_STOP_MAX_M)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, NEARBY_STOP_MAX_N)
    : []

  return {
    stop: { id: stopInfo.id, name: stopInfo.name, lat: stopInfo.lat, lon: stopInfo.lon },
    lines: Array.from(matchingLines.values()),
    nearbyStops,
  }
}

export function useStopDetail() {
  const { headwayMinutes, reliability } = useFrequency()
  const city = useCityStore()
  const stop = ref<Stop | null>(null)
  const lines = ref<StopLine[]>([])
  const nearbyStops = ref<NearbyStop[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)

  async function fetchStop(stopId: string): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const result = await fetchStopFromData(stopId, city.activeSlug, headwayMinutes.value, reliability.value)
      if (!result) throw new Error('Stop not found')
      stop.value = result.stop
      lines.value = result.lines
      nearbyStops.value = result.nearbyStops
    } catch (e) {
      error.value = e as Error
    } finally {
      loading.value = false
    }
  }

  return { stop, lines, nearbyStops, loading, error, fetchStop }
}

export interface GroupedStopLine {
  // The direction StopRow's own click acts on (schedule modal / inline
  // accordion) - always a real single direction, never the combined label
  // below, since LineStopsAccordion matches on an exact headsign.
  line: StopLine
  // Set only when this line has more than one boardable direction from this
  // stop (see groupStopLines) - overrides StopRow's default "→ headsign"
  // text with all of them joined, instead of silently picking one.
  destinationLabel?: string
}

/**
 * Collapses fetchStopFromData's one-entry-per-boardable-direction list down
 * to one entry per line (shortName+agencyId) - a stop showing "5" twice
 * because both of its directions can genuinely be boarded there (a rare
 * dual-origin case; the far more common case, a shared terminus, is already
 * filtered out upstream in fetchStopFromData) still reads as one line, not
 * two unrelated-looking rows. For a fixed-schedule line this loses nothing:
 * LineScheduleModal/useLineStopSchedule already fetch by (stopId,
 * shortName) alone, not per-direction, so its departures list is already
 * merged across every boardable direction regardless of which one's
 * `line.headsign` gets passed through. For a frequency-based line, there's
 * no such merged source of truth, so the direction with the lowest
 * headwayMin (arrives most often) becomes the representative one.
 */
export function groupStopLines(lines: StopLine[]): GroupedStopLine[] {
  const groups = new Map<string, StopLine[]>()
  for (const line of lines) {
    const key = lineKey(line.agencyId, line.shortName)
    const group = groups.get(key)
    if (group) group.push(line)
    else groups.set(key, [line])
  }

  return Array.from(groups.values(), (group): GroupedStopLine => {
    if (group.length === 1) return { line: group[0] }

    const representative = group[0].hasFixedSchedule
      ? group[0]
      : group.reduce((soonest, l) => (l.headwayMin ?? Infinity) < (soonest.headwayMin ?? Infinity) ? l : soonest)
    const destinationLabel = `→ ${group.map((l) => l.headsign ?? l.longName).join(' · ')}`
    return { line: representative, destinationLabel }
  })
}

// ── Offline routing (Minotor RAPTOR) ──────────────────────────────────────

// Attempts a full offline RAPTOR route using locally cached Minotor binaries.
// The router instance itself is built and memoized by services/offlineRouter
// (shared with useUpcomingDepartures); Minotor is only ever loaded via
// dynamic import so its ~80 kB chunk stays out of the main bundle.
async function tryLocalRouting(params: RoutingParams, citySlug: string): Promise<Itinerary[]> {
  try {
    const [offline, routes]: [OfflineRouter | null, Route[] | null] =
      await Promise.all([
        getOfflineRouter(citySlug, params.date),
        loadCityRoutes(citySlug).catch(() => null),
      ])
    if (!offline) return []
    const { findOfflineRoutes } = await import('@/composables/useMinotorRouting')
    return findOfflineRoutes(
      offline.router, offline.stopsIndex,
      params.fromLat, params.fromLon, params.toLat, params.toLon,
      params.time, routes, params.fromName, params.toName, params.transportModes,
    ) as Itinerary[]
  } catch (e) {
    // Offline routing is a best-effort optimization: on failure we fall back
    // to the server. Log so a genuine bug in the local path is visible rather
    // than silently masked by that fallback.
    console.warn('[routing] local routing failed, falling back to server', e)
    return []
  }
}

export function useItineraryPlan() {
  const itineraries = ref<Itinerary[]>([])
  const loading = ref(false)
  const error = ref<Error | null>(null)
  const isOffline = ref(false)
  // True when the shown itineraries come from the serviceStart fallback
  // below, not the originally requested time - see fetchPlan's comment.
  const isNextAvailable = ref(false)
  const city = useCityStore()

  // Single attempt at a given time: local Minotor data first (same routing
  // quality as the server, no network round-trip), else the server.
  async function planAt(params: RoutingParams): Promise<Itinerary[]> {
    const localItems = await tryLocalRouting(params, city.activeSlug)
    if (localItems.length) {
      isOffline.value = true
      enrichWalkLegs(localItems).catch(() => {})
      return localItems
    }
    isOffline.value = false
    const data = await fetchRoutingPlan({ ...params, citySlug: city.activeSlug })
    enrichWalkLegs(data.itineraries).catch(() => {})
    return data.itineraries
  }

  async function fetchPlan(params: RoutingParams): Promise<void> {
    loading.value = true
    error.value = null
    isNextAvailable.value = false

    try {
      let results = await planAt(params)

      // Nothing leaves after the requested time today, but that's a
      // different situation from "no connection exists at all" - a stop
      // pair with a real but infrequent/early-ending connection should say
      // so, not look identical to two points with no bus link whatsoever.
      // The timetable only models one service day (see
      // pipeline/generate_transit_data.mjs), so "the next available
      // connection" is approximated by re-querying from the city's own
      // service start - if a route exists anywhere in the modeled day,
      // this finds its earliest departure.
      if (results.length === 0) {
        const serviceStart = city.activeCity.schedule.serviceStart
        if (params.time !== serviceStart) {
          const fallback = await planAt({ ...params, time: serviceStart })
          if (fallback.length > 0) {
            results = fallback
            isNextAvailable.value = true
          }
        }
      }

      itineraries.value = results
    } catch (e) {
      itineraries.value = []
      if (!navigator.onLine) {
        error.value = Object.assign(new Error('offline'), { offline: true })
      } else {
        error.value = e as Error
        track('routing-error', { message: (e as Error)?.message ?? String(e) })
      }
    } finally {
      loading.value = false
    }
  }

  return { itineraries, loading, error, isOffline, isNextAvailable, fetchPlan }
}

