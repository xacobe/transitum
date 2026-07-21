import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type { NamedPosition } from '@/types'

export interface ParsedResultsQuery {
  fromLat: number
  fromLon: number
  toLat: number
  toLon: number
  fromName: string
  toName: string
  lines?: string
  // Set only when the user picked a date/time via advanced search; absent
  // means "plan for now" (see useItinerarySearch.ts).
  date?: string
  time?: string
}

/** Build the shared URL query for both mapResults and listResults routes. */
export function buildResultsQuery(
  from: NamedPosition,
  to: NamedPosition,
  lines?: string[],
  dateTime?: { date?: string; time?: string },
): LocationQueryRaw {
  const q: LocationQueryRaw = {
    fromLat: from.lat,
    fromLon: from.lon,
    fromName: from.name,
    toLat: to.lat,
    toLon: to.lon,
    toName: to.name,
  }
  if (lines?.length) q.lines = lines.join(',')
  if (dateTime?.date) q.date = dateTime.date
  if (dateTime?.time) q.time = dateTime.time
  return q
}

/**
 * Reads one side (origin/dest) of a search back out of a route query into a
 * NamedPosition. Used by the destination-search screen, whose URL carries
 * the other, already-chosen endpoint as `originLat`/`originLon`/`originName`
 * or `destLat`/`destLon`/`destName` while the user edits this one.
 */
export function namedPositionFromQuery(
  query: LocationQuery,
  prefix: 'origin' | 'dest',
  fallbackName = '',
): NamedPosition {
  return {
    lat: Number(query[`${prefix}Lat`]),
    lon: Number(query[`${prefix}Lon`]),
    name: (query[`${prefix}Name`] as string) || fallbackName,
  }
}

/** Parse the shared results URL query, returning null if coordinates are invalid. */
export function parseResultsQuery(
  query: LocationQuery,
  fallbackFromName = '',
): ParsedResultsQuery | null {
  const fromLat = Number(query.fromLat)
  const fromLon = Number(query.fromLon)
  const toLat = Number(query.toLat)
  const toLon = Number(query.toLon)
  if ([fromLat, fromLon, toLat, toLon].some(isNaN)) return null
  return {
    fromLat,
    fromLon,
    toLat,
    toLon,
    fromName: (query.fromName as string) || fallbackFromName,
    toName: (query.toName as string) || '',
    lines: query.lines as string | undefined,
    date: (query.date as string) || undefined,
    time: (query.time as string) || undefined,
  }
}
