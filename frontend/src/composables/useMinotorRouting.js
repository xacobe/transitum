/**
 * Offline transit routing using Minotor v11+ (RAPTOR algorithm).
 *
 * Two exported functions:
 *   buildRouter(timetableData, stopsData) — deserialize Uint8Array binaries
 *     into a Minotor Router + StopsIndex. Call once, cache the result.
 *   findOfflineRoutes(router, stopsIndex, ...) — run Range RAPTOR over a 90-min
 *     window and return up to 5 Pareto-optimal itineraries, each as a flat
 *     object { duration, numberOfTransfers, waitingTime, legs, mapLegs } — the
 *     same shape that server/routing.js returns for online itineraries.
 *
 * v11 API notes:
 *   - Time/Duration are plain numbers (minutes from midnight / minutes)
 *   - stop.id is a numeric StopId; stop.sourceStopId is the GTFS string
 *   - Leg types: VehicleLeg ('route' in leg), Transfer ('type' in leg),
 *     Access ('duration' in leg, station platform walks)
 *
 * Pure helper functions (buildSyntheticItinerary, buildMapLegs, isBacktracking,
 * haversineMeters, constants) live in @/services/minotorHelpers — the canonical
 * copy that server/routing.js also imports.
 */

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
} from '@/services/minotorHelpers'

/**
 * Deserializes binary transit data into a Minotor Router, Timetable and
 * StopsIndex. timetableData and stopsData are ArrayBuffer or Uint8Array.
 */
export function buildRouter(timetableData, stopsData) {
  const timetable  = Timetable.fromData(new Uint8Array(timetableData))
  const stopsIndex = StopsIndex.fromData(new Uint8Array(stopsData))
  return { router: new Router(timetable, stopsIndex), timetable, stopsIndex }
}

/**
 * Offline equivalent of the server's getStopDepartures (services/routing/routing.js)
 * — same getUpcomingDepartures call, using the locally cached timetable/stopsIndex
 * instead of the server's. stopId is the app's `<feedId>:<gtfs_stop_id>` form.
 */
export function findOfflineDepartures(timetable, stopsIndex, stopId, shortNames, time, maxCount) {
  const sourceStopId = stopId.replace(/^[^:]*:/, '')
  const [h, m] = time.split(':').map(Number)
  const afterMinutes = h * 60 + m
  return getUpcomingDepartures(timetable, stopsIndex, sourceStopId, shortNames, afterMinutes, maxCount)
}

/**
 * Finds all Pareto-optimal offline routes between two coordinates using Range RAPTOR.
 *
 * Returns up to 5 itineraries sorted by total duration.
 * Each itinerary is a flat object { duration, numberOfTransfers, waitingTime, legs, mapLegs }
 * matching the shape that server/routing.js produces for online responses.
 *
 * @param {Router} router
 * @param {StopsIndex} stopsIndex
 * @param {number} fromLat
 * @param {number} fromLon
 * @param {number} toLat
 * @param {number} toLon
 * @param {string} time  — "HH:MM:SS" departure time (same format as fetchPlan)
 * @param {Array|null} routes — routes.json data for street-following geometry
 * @param {string|null} fromName — display name of origin
 * @param {string|null} toName  — display name of destination
 * @param {string[]|null} transportModes — TransitMode values to restrict to, or
 *   null/empty for every mode (see routeTypesForModes in minotorHelpers)
 */
export function findOfflineRoutes(
  router, stopsIndex,
  fromLat, fromLon, toLat, toLon,
  time, routes = null, fromName = null, toName = null, transportModes = null,
) {
  const [h, m] = time.split(':').map(Number)
  const baseMinutes = h * 60 + m
  const routeTypes = routeTypesForModes(transportModes)

  const directDistM = haversineMeters(fromLat, fromLon, toLat, toLon)
  const collected = []

  if (directDistM <= WALK_ONLY_MAX_M) {
    collected.push(buildWalkOnlyItinerary(fromLat, fromLon, toLat, toLon, fromName, toName))
  }

  const originStops = stopsIndex.findStopsByLocation(fromLat, fromLon, NEAREST_N, WALK_RADIUS_KM)
  const destStops   = stopsIndex.findStopsByLocation(toLat,   toLon,   NEAREST_N, WALK_RADIUS_KM)
  if (!originStops.length || !destStops.length) {
    return collected
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
    } catch { /* no route from this origin stop — try next */ }
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

  return Array.from(byLineSeq.values()).slice(0, 5)
}
