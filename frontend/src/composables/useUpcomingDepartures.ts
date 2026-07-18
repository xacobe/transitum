import { ref } from 'vue'
import type { StopLine } from '@/types'
import { useCityStore } from '@/stores/city'
import { getOfflineRouter } from '@/services/offlineRouter'
import { fetchStopDepartures } from '@/services/routingClient'
import { formatTime } from '@/services/format'

// Well above any real day's trip count for a single line at one stop - the
// cap exists to bound the search loop, not because it's a meaningful count.
const FULL_DAY_MAX_COUNT = 60

// "HH:MM:00" - same shape useItinerarySearch builds for fetchPlan's `time`.
function nowLabel(): string {
  return `${formatTime(new Date())}:00`
}

// Offline equivalent of fetchStopDepartures - the memoized router instance
// comes from services/offlineRouter (shared with useRouting's planner).
async function tryOfflineDepartures(
  citySlug: string, stopId: string, shortNames: string[], time: string, maxCount?: number,
): Promise<Record<string, string[]> | null> {
  try {
    const offline = await getOfflineRouter(citySlug)
    if (!offline) return null
    const { findOfflineDepartures } = await import('@/composables/useMinotorRouting')
    return findOfflineDepartures(offline.timetable, offline.stopsIndex, stopId, shortNames, time, maxCount)
  } catch {
    return null
  }
}

// Real next-departure times, only meaningful for lines with a genuine
// published schedule (StopLine.hasFixedSchedule) - see
// pipeline/gtfs_routes_to_json.py and services/routing/minotorHelpers.js's
// getUpcomingDepartures. Frequency-based lines never get an entry here;
// StopRow falls back to the existing headway display for those.
export function useUpcomingDepartures() {
  const departuresByLine = ref<Record<string, string[]>>({})
  const city = useCityStore()

  async function load(stopId: string, lines: StopLine[]): Promise<void> {
    const shortNames = [...new Set(lines.filter((l) => l.hasFixedSchedule).map((l) => l.shortName))]
    if (!shortNames.length) {
      departuresByLine.value = {}
      return
    }

    // Same-quality data offline as online (same algorithm, same GTFS source) -
    // prefer it when the city pack is downloaded, saving a network round-trip.
    const offline = await tryOfflineDepartures(city.activeSlug, stopId, shortNames, nowLabel())
    if (offline) {
      departuresByLine.value = offline
      return
    }

    try {
      const { departures } = await fetchStopDepartures({
        citySlug: city.activeSlug,
        stopId,
        lines: shortNames,
        time: nowLabel(),
      })
      departuresByLine.value = departures
    } catch {
      departuresByLine.value = {}
    }
  }

  return { departuresByLine, load }
}

// Today's full departure list for one line at one stop (LineScheduleModal) -
// from local midnight, not "from now" like useUpcomingDepartures above.
export function useLineStopSchedule() {
  const departures = ref<string[] | null>(null)
  const loading = ref(false)
  const city = useCityStore()

  async function load(stopId: string, shortName: string): Promise<void> {
    loading.value = true
    departures.value = null
    try {
      const offline = await tryOfflineDepartures(
        city.activeSlug, stopId, [shortName], '00:00:00', FULL_DAY_MAX_COUNT,
      )
      if (offline) {
        departures.value = offline[shortName] ?? []
        return
      }
      const { departures: online } = await fetchStopDepartures({
        citySlug: city.activeSlug,
        stopId,
        lines: [shortName],
        time: '00:00:00',
        maxCount: FULL_DAY_MAX_COUNT,
      })
      departures.value = online[shortName] ?? []
    } catch {
      departures.value = []
    } finally {
      loading.value = false
    }
  }

  return { departures, loading, load }
}
