import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useItineraryPlan } from '@/composables/useRouting'
import { useFrequency } from '@/composables/useFrequency'
import { lineKey, agencyIdFromGtfsId } from '@/composables/useAgencies'
import { useTransitModeFilter } from '@/composables/useTransitModeFilter'
import { track } from '@/composables/useAnalytics'
import { useCityStore } from '@/stores/city'
import { formatTime } from '@/services/format'
import { buildResultsQuery, parseResultsQuery } from '@/services/resultsQuery'
import { useNavigation } from '@/composables/useNavigation'
import type { Itinerary, BusLeg } from '@/types'

interface ItinerarySearchOptions {
  backRouteName: string
  selfRouteName: string
  searchRouteName: string
}

// Plain shortNames: this is also what ends up persisted/displayed as a
// favorited route's line badges — see useAgencies.ts for where the
// composite key actually matters (color, internal dedup).
export function busLinesOf(itinerary: Itinerary): string[] {
  return [
    ...new Set(
      itinerary.legs
        .filter((leg): leg is BusLeg => leg.mode === 'BUS')
        .map((leg) => leg.route.shortName)
        .filter(Boolean),
    ),
  ]
}

function busLineKeysOf(itinerary: Itinerary): string[] {
  return itinerary.legs
    .filter((leg): leg is BusLeg => leg.mode === 'BUS' && !!leg.route?.shortName)
    .map((leg) => `${lineKey(agencyIdFromGtfsId(leg.agency?.gtfsId), leg.route.shortName)}:${leg.headsign}`)
}

/**
 * Shared itinerary search for Résultats (map) and Liste (text): parses
 * from/to from the route query, (re)triggers fetchPlan on change, dedups
 * OTP's repeated-by-synthetic-headway results down to one per bus line
 * sequence, and tracks the active/selected itinerary.
 */
export function useItinerarySearch({ backRouteName, selfRouteName, searchRouteName }: ItinerarySearchOptions) {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
  const { isWithinServiceHours, nextServiceStart } = useFrequency()
  const { itineraries, loading, error, isOffline, isNextAvailable, fetchPlan } = useItineraryPlan()
  const { goBack: navGoBack } = useNavigation()
  const cityStore = useCityStore()
  const { availableModes, showFilter, isActive, toggle: toggleMode, transportModesParam } =
    useTransitModeFilter()

  const sortMode = ref<'rapide' | 'tot'>('rapide')
  const selectedItinerary = ref<Itinerary | null>(null)

  const parsed = computed(() => parseResultsQuery(route.query, t('common.myPosition')))
  const fromLat = computed(() => parsed.value?.fromLat ?? NaN)
  const fromLon = computed(() => parsed.value?.fromLon ?? NaN)
  const toLat = computed(() => parsed.value?.toLat ?? NaN)
  const toLon = computed(() => parsed.value?.toLon ?? NaN)
  const fromName = computed(() => parsed.value?.fromName ?? t('common.myPosition'))
  const toName = computed(() => parsed.value?.toName ?? '')

  const serviceOpen = computed(() => isWithinServiceHours())

  const uniqueItineraries = computed(() => {
    const byLines = new Map<string, Itinerary>()
    for (const it of itineraries.value) {
      const key = busLineKeysOf(it).join(',')
      const existing = byLines.get(key)
      if (!existing || (it.legs[0].startTime ?? Infinity) < (existing.legs[0].startTime ?? Infinity)) {
        byLines.set(key, it)
      }
    }
    return Array.from(byLines.values())
  })

  // Walk-only alternatives sort after every bus alternative, regardless of
  // sort mode — this is a transit app, "recommended" shouldn't mean "walk"
  // just because OTP's modeled wait makes walking marginally faster on paper.
  const sortedItineraries = computed(() => {
    const list = [...uniqueItineraries.value]
    const compareBy: (a: Itinerary, b: Itinerary) => number =
      sortMode.value === 'tot'
        ? (a, b) => (a.legs[0].startTime ?? 0) - (b.legs[0].startTime ?? 0)
        : (a, b) => a.duration - b.duration
    list.sort((a, b) => {
      const aWalkOnly = busLinesOf(a).length === 0
      const bWalkOnly = busLinesOf(b).length === 0
      if (aWalkOnly !== bWalkOnly) return aWalkOnly ? 1 : -1
      return compareBy(a, b)
    })
    return list
  })

  const activeItinerary = computed(() => selectedItinerary.value ?? sortedItineraries.value[0] ?? null)

  watch(
    [fromLat, fromLon, toLat, toLon, transportModesParam],
    () => {
      selectedItinerary.value = null
      if (Number.isNaN(fromLat.value) || Number.isNaN(toLat.value)) return
      const when = nextServiceStart()
      const time = `${formatTime(when)}:00`
      track('route-searched', { from: fromName.value, to: toName.value, city: cityStore.activeSlug })
      fetchPlan({
        fromLat: fromLat.value, fromLon: fromLon.value,
        toLat: toLat.value, toLon: toLon.value,
        time, fromName: fromName.value, toName: toName.value,
        transportModes: transportModesParam.value,
      })
    },
    { immediate: true },
  )

  watch(loading, (isLoading) => {
    if (isLoading) return
    if (!serviceOpen.value) {
      track('service-closed-shown', { city: cityStore.activeSlug })
    } else if (sortedItineraries.value.length === 0 && !error.value) {
      track('route-no-results', { from: fromName.value, to: toName.value, city: cityStore.activeSlug })
    }
  })

  function goBack(): void {
    navGoBack(backRouteName)
  }

  function swapOriginDestination(): void {
    router.replace({
      name: selfRouteName,
      query: buildResultsQuery(
        { lat: toLat.value, lon: toLon.value, name: toName.value },
        { lat: fromLat.value, lon: fromLon.value, name: fromName.value },
      ),
    })
  }

  function goEdit(field: 'origin' | 'destination'): void {
    router.push({
      name: searchRouteName,
      query: {
        field,
        originLat: fromLat.value, originLon: fromLon.value, originName: fromName.value,
        destLat: toLat.value, destLon: toLon.value, destName: toName.value,
      },
    })
  }

  return {
    itineraries, loading, error, isOffline, isNextAvailable,
    sortMode, selectedItinerary,
    fromLat, fromLon, toLat, toLon, fromName, toName,
    serviceOpen, uniqueItineraries, sortedItineraries, activeItinerary,
    availableModes, showModeFilter: showFilter, isModeActive: isActive, toggleMode,
    goBack,
    swapOriginDestination,
    goEditOrigin: () => goEdit('origin'),
    goEditDestination: () => goEdit('destination'),
  }
}
