import { computed } from 'vue'
import { useCityStore } from '@/stores/city'
import type { Agency } from '@/types'

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

/** Composite key used wherever a line's identity matters (Vue list keys,
 * dedup Maps/Sets, color hashing, favorites) — `shortName` alone isn't
 * unique once a city has more than one agency. */
export function lineKey(agencyId: string | null | undefined, shortName: string): string {
  return `${agencyId ?? ''}::${shortName}`
}

/** OTP's `Agency.gtfsId` carries the feed prefix (e.g.
 * "citySlug:AGENCY_ID") — this strips it to the plain agencyId
 * (the city config's `agencyId`) so OTP-derived data lines up with
 * routes.json-derived data. */
export function agencyIdFromGtfsId(gtfsId: string | null | undefined): string | null {
  if (!gtfsId) return null
  return gtfsId.slice(gtfsId.indexOf(':') + 1)
}
