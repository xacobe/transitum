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
}

/** Build the shared URL query for both mapResults and listResults routes. */
export function buildResultsQuery(
  from: NamedPosition,
  to: NamedPosition,
  lines?: string[],
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
  return q
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
  }
}
