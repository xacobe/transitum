/**
 * Pure helper functions shared between server/routing.js and
 * frontend/src/composables/useMinotorRouting.js.
 *
 * No runtime environment dependencies (no Node.js APIs, no Vue, no browser APIs)
 * — safe to import from both sides.
 *
 * The frontend imports via frontend/src/services/minotorHelpers.js (re-export)
 * so it gets a clean @/ alias path.  The server imports directly: './minotorHelpers.js'.
 */

// ── Routing constants ──────────────────────────────────────────────────────
export const WALK_MPS             = 1.25
export const NEAREST_N            = 8
export const WALK_RADIUS_KM       = 1.5
export const MAX_TRANSFERS        = 4
export const RANGE_WINDOW_MIN     = 90
// Distances under this threshold always include a walk-only itinerary
// so the user can see that just walking is an option.
export const WALK_ONLY_MAX_M      = 700

// ── Geometry ───────────────────────────────────────────────────────────────

/** Approximate distance between two lat/lon points in metres. */
export function haversineMeters(lat1, lon1, lat2, lon2) {
  const r  = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a  = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(a))
}

function nearestIdx(arr, lat, lon, getLat, getLon) {
  let minDist = Infinity, bestIdx = -1
  for (let i = 0; i < arr.length; i++) {
    const dLat = getLat(arr[i]) - lat
    const dLon = getLon(arr[i]) - lon
    const d = dLat * dLat + dLon * dLon
    if (d < minDist) { minDist = d; bestIdx = i }
  }
  return bestIdx
}

// ── Route shape extraction ─────────────────────────────────────────────────

// Remove hook points created by OSM way-stitching artifacts: a point where
// the incoming and outgoing segment form an angle >150° (near-U-turn) is a
// junction error and is dropped. Legitimate bus-route turns are ≤90°.
// Iterates until stable because removing one hook can expose another.
function removeHooks(pts) {
  let arr = pts
  for (let pass = 0; pass < 5; pass++) {
    if (arr.length < 3) break
    const out = [arr[0]]
    let removed = false
    for (let i = 1; i < arr.length - 1; i++) {
      const prev = out[out.length - 1]
      const cur  = arr[i]
      const next = arr[i + 1]
      const ax = (cur[1]  - prev[1]) * Math.cos(cur[0]  * Math.PI / 180)
      const ay =  cur[0]  - prev[0]
      const bx = (next[1] - cur[1])  * Math.cos(next[0] * Math.PI / 180)
      const by =  next[0] - cur[0]
      const aLen = Math.sqrt(ax * ax + ay * ay)
      const bLen = Math.sqrt(bx * bx + by * by)
      if (aLen * 111000 < 2) { removed = true; continue }       // near-duplicate
      if (bLen * 111000 < 2) { out.push(cur); continue }
      const cosTheta = (ax * bx + ay * by) / (aLen * bLen)
      if (Math.acos(Math.max(-1, Math.min(1, cosTheta))) < 2.618) { // < 150°
        out.push(cur)
      } else {
        removed = true
      }
    }
    out.push(arr[arr.length - 1])
    arr = out
    if (!removed) break
  }
  return arr
}

function getRouteShapeSegment(routes, leg) {
  if (leg.from.lat == null || leg.to.lat == null) return null
  const routeData = routes.find(r => r.shortName === leg.route.name)
  if (!routeData) return null

  for (const dir of routeData.directions) {
    const { points, stops } = dir
    if (!points?.length || !stops?.length) continue

    const fromStopIdx = nearestIdx(stops, leg.from.lat, leg.from.lon, s => s.lat, s => s.lon)
    const toStopIdx   = nearestIdx(stops, leg.to.lat,   leg.to.lon,   s => s.lat, s => s.lon)
    if (fromStopIdx < 0 || toStopIdx < 0 || fromStopIdx >= toStopIdx) continue

    const fromS = stops[fromStopIdx]
    const toS   = stops[toStopIdx]
    const fromPtIdx = nearestIdx(points, fromS.lat, fromS.lon, p => p[0], p => p[1])
    const toPtIdx   = nearestIdx(points, toS.lat,   toS.lon,   p => p[0], p => p[1])
    if (fromPtIdx < 0 || toPtIdx < 0 || fromPtIdx === toPtIdx) continue

    // Shape may be stored in reverse in OSM — slice between the two stop
    // indices and flip if needed so points go from boarding to alighting.
    const [lo, hi] = fromPtIdx < toPtIdx
      ? [fromPtIdx, toPtIdx]
      : [toPtIdx,   fromPtIdx]
    const slice = points.slice(lo, hi + 1)
    const oriented = fromPtIdx < toPtIdx ? slice : [...slice].reverse()

    return removeHooks(oriented)
  }

  return null
}

// ── Map legs (geometry for MiniMap rendering) ──────────────────────────────

export function buildMapLegs(legs, fromLat, fromLon, toLat, toLon, originStop, destStop, routes) {
  const mapLegs = []
  if (!legs.length) return mapLegs

  const firstBusLeg = legs.find(l => 'route' in l)
  const lastBusLeg  = [...legs].reverse().find(l => 'route' in l)

  // Walk to the exact boarding stop coordinates rather than the stop-index coords,
  // so the walk end and the bus shape start are always the same point.
  const boardLat = firstBusLeg?.from.lat ?? originStop.lat
  const boardLon = firstBusLeg?.from.lon ?? originStop.lon
  if (boardLat != null) {
    mapLegs.push({
      mode: 'WALK',
      points: [[fromLat, fromLon], [boardLat, boardLon]],
      routeShortName: null, routeAgencyId: null,
    })
  }

  for (const leg of legs) {
    const fromPt = leg.from.lat != null ? [leg.from.lat, leg.from.lon] : null
    const toPt   = leg.to.lat  != null ? [leg.to.lat,   leg.to.lon]   : null

    if ('route' in leg) {
      const shapePoints = routes ? getRouteShapeSegment(routes, leg) : null
      let points
      if (shapePoints && fromPt && toPt) {
        // Clamp shape to the exact boarding/alighting coords — OSM shape points may
        // be slightly offset from the stop positions, which creates visual gaps.
        points = [fromPt, ...shapePoints.slice(1, -1), toPt]
      } else {
        points = shapePoints ?? (fromPt && toPt ? [fromPt, toPt] : null)
      }
      if (points) mapLegs.push({ mode: 'BUS', points, routeShortName: leg.route.name, routeAgencyId: null })
    } else {
      if (fromPt && toPt) mapLegs.push({ mode: 'WALK', points: [fromPt, toPt], routeShortName: null, routeAgencyId: null })
    }
  }

  const alightLat = lastBusLeg?.to.lat ?? destStop.lat
  const alightLon = lastBusLeg?.to.lon ?? destStop.lon
  if (alightLat != null) {
    mapLegs.push({
      mode: 'WALK',
      points: [[alightLat, alightLon], [toLat, toLon]],
      routeShortName: null, routeAgencyId: null,
    })
  }

  return mapLegs
}

// ── Synthetic itinerary (OTP-compatible shape for ItineraryCard) ───────────

/**
 * Converts a Minotor Route object into an OTP-compatible itinerary object.
 * walkToMin / walkFromMin are in minutes; all times in the result are ms since epoch.
 */
export function buildSyntheticItinerary(
  route, walkToMin, walkFromMin, fromLat, fromLon, toLat, toLon, fromName, toName,
) {
  const midnight = new Date()
  midnight.setHours(0, 0, 0, 0)
  const toMs = mins => midnight.getTime() + mins * 60_000

  const minotorLegs    = route.legs
  const firstVehicleLeg = minotorLegs.find(l => 'route' in l)
  const lastVehicleLeg  = [...minotorLegs].reverse().find(l => 'route' in l)

  const boardMs  = firstVehicleLeg ? toMs(firstVehicleLeg.departureTime) : Date.now()
  const alightMs = lastVehicleLeg  ? toMs(lastVehicleLeg.arrivalTime)    : Date.now()

  const legs = []

  legs.push({
    mode:      'WALK',
    duration:  walkToMin * 60,
    from:      { name: fromName ?? 'Ma position', lat: fromLat, lon: fromLon },
    to:        { name: firstVehicleLeg?.from?.name ?? '' },
    startTime: boardMs - walkToMin * 60_000,
    endTime:   boardMs,
  })

  for (let i = 0; i < minotorLegs.length; i++) {
    const leg = minotorLegs[i]
    if ('route' in leg) {
      legs.push({
        mode:      'BUS',
        duration:  (leg.arrivalTime - leg.departureTime) * 60,
        route:     { shortName: leg.route.name },
        agency:    { gtfsId: null, name: null },
        startTime: toMs(leg.departureTime),
        endTime:   toMs(leg.arrivalTime),
        from:      { name: leg.from.name, lat: leg.from.lat ?? null, lon: leg.from.lon ?? null },
        to:        { name: leg.to.name,   lat: leg.to.lat  ?? null, lon: leg.to.lon  ?? null },
        headsign:  leg.to.name,
      })
      // Minotor omits the Transfer leg between consecutive VehicleLegs — insert it
      // synthetically so the UI can show a transfer chip with the waiting time.
      const next = minotorLegs[i + 1]
      if (next && 'route' in next) {
        legs.push({
          mode:     'WALK',
          duration: Math.max(0, next.departureTime - leg.arrivalTime) * 60,
          from: { name: leg.to.name,   lat: leg.to.lat   ?? null, lon: leg.to.lon   ?? null },
          to:   { name: next.from.name, lat: next.from.lat ?? null, lon: next.from.lon ?? null },
        })
      }
    } else {
      const durMins = 'duration' in leg ? leg.duration : (leg.minTransferTime ?? 2)
      legs.push({
        mode:     'WALK',
        duration: durMins * 60,
        from: { name: leg.from.name, lat: leg.from.lat ?? null, lon: leg.from.lon ?? null },
        to:   { name: leg.to.name,   lat: leg.to.lat  ?? null, lon: leg.to.lon  ?? null },
      })
    }
  }

  legs.push({
    mode:      'WALK',
    duration:  walkFromMin * 60,
    from:      { name: lastVehicleLeg?.to?.name ?? '' },
    to:        { name: toName ?? 'Destination', lat: toLat, lon: toLon },
    startTime: alightMs,
    endTime:   alightMs + walkFromMin * 60_000,
  })

  let waitingTimeSec = 0
  for (let i = 0; i < minotorLegs.length; i++) {
    if (!('route' in minotorLegs[i])) continue
    for (let j = i + 1; j < minotorLegs.length; j++) {
      if ('route' in minotorLegs[j]) {
        const gapMins = minotorLegs[j].departureTime - minotorLegs[i].arrivalTime
        let walkBetween = 0
        for (let k = i + 1; k < j; k++) {
          const l = minotorLegs[k]
          walkBetween += 'duration' in l ? l.duration : (l.minTransferTime ?? 2)
        }
        waitingTimeSec += Math.max(0, gapMins - walkBetween) * 60
        break
      }
    }
  }

  const busLegs = minotorLegs.filter(l => 'route' in l)
  const numberOfTransfers = Math.max(0, busLegs.length - 1)
  const totalDurationSec  = (walkToMin + route.totalDuration() + walkFromMin) * 60

  return { duration: totalDurationSec, numberOfTransfers, waitingTime: waitingTimeSec, legs }
}

// ── Backtracking filter ────────────────────────────────────────────────────

/**
 * Returns true when two consecutive BUS legs share a route shortName and the first
 * leg ends farther from the destination than it started — a RAPTOR artifact from
 * stops that appear only on one direction of a bidirectional line.
 */
export function isBacktracking(itinerary, toLat, toLon) {
  const busLegs = itinerary.legs.filter(l => l.mode === 'BUS')
  for (let i = 0; i < busLegs.length - 1; i++) {
    const leg  = busLegs[i]
    const next = busLegs[i + 1]
    const { from, to } = leg
    if (from.lat == null || to.lat == null) continue
    const distFrom = haversineMeters(from.lat, from.lon, toLat, toLon)
    const distTo   = haversineMeters(to.lat,   to.lon,   toLat, toLon)

    if (leg.route?.shortName === next.route?.shortName) {
      // Same route in-seat continuation: any backward step is wrong
      if (distTo > distFrom) return true
    } else {
      // Cross-route transfer: a leg that ends >50% further from the destination
      // than it began is a significant detour before changing lines — reject it.
      if (distTo > distFrom * 1.5) return true
    }
  }
  return false
}

// ── Walk-only itinerary ────────────────────────────────────────────────────

// ── Upcoming departures (stop timetable) ────────────────────────────────────

function formatMinutes(min) {
  const m = ((min % 1440) + 1440) % 1440   // wrap after-midnight GTFS times (e.g. 25:30) into 00:30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Next scheduled departures for one or more lines (by GTFS route_short_name)
 * at a specific stop, on or after `afterMinutes` (minutes since local
 * midnight — same units as everywhere else in this file, see the v11 API
 * notes at the top of useMinotorRouting.js).
 *
 * Only meaningful for schedule-based directions (RouteDirection.hasFixedSchedule
 * in the pipeline/frontend types, see pipeline/gtfs_routes_to_json.py) — Minotor
 * can technically synthesize per-trip times from a frequencies.txt-based route
 * too, but that would fabricate a precision the source data doesn't have.
 * Callers must only pass shortNames for hasFixedSchedule lines.
 *
 * Merges across every internal Minotor Route matching a shortName that passes
 * through the stop (a line can span more than one — e.g. a loop passing the
 * same physical stop twice, or distinct shape variants). Minotor's public API
 * carries no headsign, so this can't disambiguate directions any finer than
 * "this line, this physical stop" — harmless in the common case of one
 * direction per physical stop; two headsigns of the same line sharing one
 * stop would see the same merged times on both.
 *
 * @param {import('minotor').Timetable} timetable
 * @param {import('minotor').StopsIndex} stopsIndex
 * @param {string} sourceStopId — the GTFS stop_id, *without* the app's
 *   `<feedId>:` prefix (strip it before calling — see the city config's feedId).
 * @param {string[]} shortNames
 * @param {number} afterMinutes
 * @param {number} [maxCount=3]
 * @returns {Record<string, string[]>} shortName → up to `maxCount` "HH:MM" times, ascending.
 */
export function getUpcomingDepartures(timetable, stopsIndex, sourceStopId, shortNames, afterMinutes, maxCount = 3) {
  const result = {}
  const stop = stopsIndex.findStopBySourceStopId(sourceStopId)
  if (!stop) {
    for (const name of shortNames) result[name] = []
    return result
  }

  const routesAtStop = timetable.routesPassingThrough(stop.id)
  for (const shortName of shortNames) {
    const departures = []
    for (const route of routesAtStop) {
      if (timetable.getServiceRouteInfo(route).name !== shortName) continue
      for (const stopIndex of route.stopRouteIndices(stop.id)) {
        let after = afterMinutes
        for (let i = 0; i < maxCount; i++) {
          const tripIndex = route.findEarliestTrip(stopIndex, after)
          if (tripIndex === undefined) break
          const dep = route.departureFrom(stopIndex, tripIndex)
          departures.push(dep)
          after = dep + 1
        }
      }
    }
    result[shortName] = [...new Set(departures)].sort((a, b) => a - b).slice(0, maxCount).map(formatMinutes)
  }
  return result
}

/** Builds an OTP-compatible itinerary with a single WALK leg (no transit). */
export function buildWalkOnlyItinerary(fromLat, fromLon, toLat, toLon, fromName, toName) {
  const distM   = haversineMeters(fromLat, fromLon, toLat, toLon)
  const walkSec = Math.round(distM / WALK_MPS)
  const now     = Date.now()
  return {
    duration: walkSec,
    numberOfTransfers: 0,
    waitingTime: 0,
    legs: [
      {
        mode:      'WALK',
        duration:  walkSec,
        from:      { name: fromName ?? 'Départ', lat: fromLat, lon: fromLon },
        to:        { name: toName  ?? 'Arrivée', lat: toLat,   lon: toLon   },
        startTime: now,
        endTime:   now + walkSec * 1000,
      },
    ],
    mapLegs: [
      {
        mode: 'WALK',
        points: [[fromLat, fromLon], [toLat, toLon]],
        routeShortName: null, routeAgencyId: null,
      },
    ],
  }
}
