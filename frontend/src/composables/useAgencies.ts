import { computed } from 'vue'
import { useCityStore } from '@/stores/city'
import type { Agency, Route } from '@/types'

/**
 * Agencies of the active city (the city config's `agencies`, never a
 * hardcoded frontend constant). Most cities have exactly one, so
 * `hasMultipleAgencies` is false and the company name/badge doesn't show
 * for them - a multi-source city (several GTFS feeds merged by
 * import_gtfs_multi.py, e.g. one operator per transport mode) is where it
 * actually kicks in.
 */
export function useAgencies() {
  const city = useCityStore()
  const agencies = computed<Agency[]>(() => city.activeCity.agencies)
  const hasMultipleAgencies = computed(() => agencies.value.length > 1)

  function agencyFor(agencyId: string): Agency | null {
    return agencies.value.find((a) => a.agencyId === agencyId) ?? null
  }

  return { agencies, hasMultipleAgencies, agencyFor }
}

/** Composite key used for color hashing, favorites, and other contexts that
 * only ever have a bare shortName + agencyId to work with (no full Route
 * object) — an OTP-derived itinerary leg, a persisted favorite, and the
 * like. `shortName` alone isn't unique once a city has more than one
 * agency. NOT guaranteed globally unique even so — see routeIdentity()
 * for when a full Route is available and true uniqueness matters (e.g. a
 * Vue list :key or "is this the one that was clicked" tracking). */
export function lineKey(agencyId: string | null | undefined, shortName: string): string {
  return `${agencyId ?? ''}::${shortName}`
}

/** Placeholder `/lines/:agencyId/:shortName` path segment for openLine()
 * when the caller genuinely doesn't know the agencyId - a favorite saved
 * before FavoriteLine.agencyId existed, the only realistic case (every
 * other line-navigating call site has a real one on hand). useRouteDetail
 * matches this by falling back to shortName alone, same residual risk
 * (a same-agency shortName reuse) the rest of the app already accepts for
 * this kind of stale local data - see FavoriteLine's matchesLine(). */
export const UNKNOWN_AGENCY = '_'

/** True unique identity for a routes.json entry - prefer this over lineKey()
 * whenever a full Route object is on hand. Falls back to lineKey() for data
 * generated before Route.id existed, which carries the same
 * same-shortName-within-one-agency collision risk lineKey() always had (see
 * Route.id's own comment) - a real if rare case (a region-wide bus merge
 * with independent local operators reusing a short label), not just a
 * multi-agency one. */
export function routeIdentity(route: Route): string {
  return route.id ?? lineKey(route.agencyId, route.shortName)
}

/** OTP's `Agency.gtfsId` carries the feed prefix (e.g.
 * "citySlug:AGENCY_ID") — this strips it to the plain agencyId
 * (the city config's `agencyId`) so OTP-derived data lines up with
 * routes.json-derived data. */
export function agencyIdFromGtfsId(gtfsId: string | null | undefined): string | null {
  if (!gtfsId) return null
  return gtfsId.slice(gtfsId.indexOf(':') + 1)
}
