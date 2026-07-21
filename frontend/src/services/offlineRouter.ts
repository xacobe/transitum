/**
 * Shared, memoized access to the offline Minotor RAPTOR router.
 *
 * buildRouter() deserializes the timetable binary on each call — this module
 * builds it once per (city, service pattern) pair and hands the same
 * instance to every consumer (itinerary planning in useRouting.ts, stop
 * departures in useUpcomingDepartures.ts). A city can have several distinct
 * weekday patterns (see PatternsManifest); each gets its own cache entry,
 * keyed by the pattern's content hash - so querying both "today" and e.g. a
 * Saturday in the same session builds each router at most once.
 *
 * Minotor itself is only ever loaded via dynamic import so its ~80 kB chunk
 * stays out of the main bundle — online-only users never pay the cost. The
 * `import type` below is erased at compile time and does not affect that.
 */
import { useOfflineTiles } from '@/composables/useOfflineTiles'
import type { Router, Timetable, StopsIndex } from 'minotor'

export interface OfflineRouter {
  router: Router
  timetable: Timetable
  stopsIndex: StopsIndex
}

const _cache = new Map<string, OfflineRouter>()

/**
 * Returns the router built from the city's locally stored binaries for the
 * given date (or today, if omitted), or null when the city pack isn't
 * downloaded, IndexedDB is unavailable, or the date falls on a
 * calendar_dates.txt exception not modeled offline (see
 * useOfflineTiles.getMinotorData).
 */
export async function getOfflineRouter(citySlug: string, date?: string | null): Promise<OfflineRouter | null> {
  const { getMinotorData } = useOfflineTiles() // singleton — safe to call outside setup

  const minotorData = await getMinotorData(citySlug, date)
  if (!minotorData) return null

  const cacheKey = `${citySlug}:${minotorData.patternHash}`
  let cached = _cache.get(cacheKey)
  if (!cached) {
    const { buildRouter } = await import('@/composables/useMinotorRouting')
    cached = buildRouter(minotorData.timetableData, minotorData.stopsData)
    _cache.set(cacheKey, cached)
  }
  return cached
}
