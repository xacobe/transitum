import { readFileSync } from 'fs'
import { join } from 'path'
import { Router, Timetable, StopsIndex, RangeQuery } from 'minotor'
import {
  haversineMeters,
  buildSyntheticItinerary,
  buildMapLegs,
  buildWalkOnlyItinerary,
  isBacktracking,
  getUpcomingDepartures,
  WALK_MPS,
  NEAREST_N,
  WALK_RADIUS_KM,
  WALK_ONLY_MAX_M,
  MAX_TRANSFERS,
  RANGE_WINDOW_MIN,
  routeTypesForModes,
} from './minotorHelpers.js'

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

// A city's GTFS calendar can have several distinct weekday service patterns
// (weekday/Saturday/Sunday, sometimes more — see patterns.json, written by
// pipeline/generate_transit_data.mjs). One Router/Timetable pair is loaded
// per *unique* pattern (cities with a single always-on service, like every
// OSM-synthetic city, end up with exactly one), keyed by content hash.
export function loadCityData(slug, dataDir) {
  const cityDir = join(dataDir, slug)
  const stopsData = readFileSync(join(cityDir, 'stops.bin'))
  const stopsIndex = StopsIndex.fromData(new Uint8Array(stopsData))
  const patterns = JSON.parse(readFileSync(join(cityDir, 'patterns.json'), 'utf8'))

  const routers = new Map() // pattern hash -> { router, timetable }
  for (const hash of new Set(Object.values(patterns.weekdayToPattern))) {
    const timetableData = readFileSync(join(cityDir, `timetable.${hash}.bin`))
    const timetable = Timetable.fromData(new Uint8Array(timetableData))
    routers.set(hash, { router: new Router(timetable, stopsIndex), timetable })
  }

  let routes = null
  try {
    routes = JSON.parse(readFileSync(join(cityDir, 'routes.json'), 'utf8'))
  } catch {
    console.warn(`[${slug}] routes.json unavailable — bus legs will use straight lines`)
  }

  return { routers, weekdayToPattern: patterns.weekdayToPattern, stopsIndex, routes }
}

// Picks the Router/Timetable for a given calendar date (or today, if none
// given) by weekday. Parsed as UTC so the weekday resolution doesn't depend
// on the server's local timezone.
function resolveForDate(cityData, dateStr) {
  const weekday = dateStr
    ? WEEKDAY_KEYS[new Date(`${dateStr}T00:00:00Z`).getUTCDay()]
    : WEEKDAY_KEYS[new Date().getUTCDay()]
  return cityData.routers.get(cityData.weekdayToPattern[weekday])
}

// stopId here is the app's `<feedId>:<gtfs_stop_id>` form (see the city config's
// feedId) — strip the prefix before handing off to Minotor, which indexes
// stops by the raw GTFS stop_id.
export function getStopDepartures(cityData, { stopId, lines, time, maxCount, date }) {
  const { stopsIndex } = cityData
  const { timetable } = resolveForDate(cityData, date)
  const sourceStopId = stopId.replace(/^[^:]*:/, '')
  const [h, m] = time.split(':').map(Number)
  const afterMinutes = h * 60 + m
  return getUpcomingDepartures(timetable, stopsIndex, sourceStopId, lines, afterMinutes, maxCount)
}

export function planRoute(
  cityData,
  { fromLat, fromLon, toLat, toLon, time, fromName, toName, numItineraries = 5, transportModes = null, date },
) {
  const { stopsIndex, routes } = cityData
  const { router } = resolveForDate(cityData, date)

  const [h, m] = time.split(':').map(Number)
  const baseMinutes = h * 60 + m
  const routeTypes = routeTypesForModes(transportModes)

  const directDistM = haversineMeters(fromLat, fromLon, toLat, toLon)
  const collected = []

  // Compute walk-only before the stop lookup so it's always available,
  // even when no stops exist within the search radius.
  if (directDistM <= WALK_ONLY_MAX_M) {
    collected.push(buildWalkOnlyItinerary(fromLat, fromLon, toLat, toLon, fromName, toName))
  }

  const originStops = stopsIndex.findStopsByLocation(fromLat, fromLon, NEAREST_N, WALK_RADIUS_KM)
  const destStops   = stopsIndex.findStopsByLocation(toLat,   toLon,   NEAREST_N, WALK_RADIUS_KM)
  if (!originStops.length || !destStops.length) {
    return collected  // walk-only if distance allows, else truly unreachable
  }

  const destStopIds = new Set(destStops.map(s => s.id))

  for (const originStop of originStops) {
    const oLat = originStop.lat ?? fromLat
    const oLon = originStop.lon ?? fromLon
    const walkToMin = Math.round(haversineMeters(fromLat, fromLon, oLat, oLon) / WALK_MPS / 60)
    const depMin = baseMinutes + walkToMin

    try {
      let queryBuilder = new RangeQuery.Builder()
        .from(originStop.id)
        .to(destStopIds)
        .departureTime(depMin)
        .lastDepartureTime(depMin + RANGE_WINDOW_MIN)
        .maxTransfers(MAX_TRANSFERS)
      if (routeTypes) queryBuilder = queryBuilder.transportModes(routeTypes)
      const rangeResult = router.rangeRoute(queryBuilder.build())

      for (const route of rangeResult.getRoutes()) {
        const lastVehicleLeg = [...route.legs].reverse().find(l => 'route' in l)
        const matchedDest = destStops.find(s => s.id === lastVehicleLeg?.to?.id) ?? destStops[0]
        const dLat = matchedDest.lat ?? toLat
        const dLon = matchedDest.lon ?? toLon
        const walkFromMin = Math.round(haversineMeters(toLat, toLon, dLat, dLon) / WALK_MPS / 60)

        collected.push({
          ...buildSyntheticItinerary(
            route, walkToMin, walkFromMin, fromLat, fromLon, toLat, toLon, fromName, toName, routes,
          ),
          mapLegs: buildMapLegs(
            route.legs, fromLat, fromLon, toLat, toLon, originStop, matchedDest, routes,
          ),
        })
      }
    } catch {
      // No route from this origin stop — try the next
    }
  }

  const valid = collected.filter(it => !isBacktracking(it, toLat, toLon))
  valid.sort((a, b) => a.duration - b.duration)

  const byLineSeq = new Map()
  for (const it of valid) {
    const key = it.legs
      .filter(l => l.mode === 'BUS')
      .map(l => l.route?.shortName)
      .filter(Boolean)
      .join(',')
    if (!byLineSeq.has(key)) byLineSeq.set(key, it)
  }

  return Array.from(byLineSeq.values()).slice(0, numItineraries)
}
