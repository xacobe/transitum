/**
 * Shared, memoized access to the offline Minotor RAPTOR router.
 *
 * buildRouter() deserializes ~260KB of binary data on each call — this module
 * builds it once per downloaded data version and hands the same instance to
 * every consumer (itinerary planning in useRouting.ts, stop departures in
 * useUpcomingDepartures.ts). The cache key changes automatically when
 * updateDataFiles() stores new binaries (byte lengths differ).
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

let _cacheKey: string | null = null
let _cacheValue: OfflineRouter | null = null

/**
 * Returns the router built from the city's locally stored binaries, or null
 * when the city pack is not downloaded (or IndexedDB is unavailable).
 *
 * On a cache hit this never touches IndexedDB: getDownloadedAt() reads an
 * already-in-memory timestamp (populated once at init, updated in lockstep
 * with the binaries by updateDataFiles()), so it's a valid substitute for
 * "have the binaries changed" without paying for the two ArrayBuffer reads
 * getMinotorData() would need to compute the old byte-length-based key.
 * Falls back to that byte-length key (same as before) on the rare case
 * getDownloadedAt() hasn't loaded yet (cold start, init() still in flight).
 */
export async function getOfflineRouter(citySlug: string): Promise<OfflineRouter | null> {
  const { getDownloadedAt, getMinotorData } = useOfflineTiles() // singleton — safe to call outside setup

  const downloadedAt = getDownloadedAt(citySlug)
  const fastCacheKey = downloadedAt ? `${citySlug}:${downloadedAt}` : null
  if (fastCacheKey && _cacheKey === fastCacheKey) return _cacheValue

  const minotorData = await getMinotorData(citySlug)
  if (!minotorData) return null

  const cacheKey =
    fastCacheKey ?? `${citySlug}:${minotorData.timetableData.byteLength}:${minotorData.stopsData.byteLength}`
  if (_cacheKey !== cacheKey) {
    const { buildRouter } = await import('@/composables/useMinotorRouting')
    _cacheValue = buildRouter(minotorData.timetableData, minotorData.stopsData)
    _cacheKey = cacheKey
  }
  return _cacheValue
}
