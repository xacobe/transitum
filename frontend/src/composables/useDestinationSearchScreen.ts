import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDestinationSearch } from '@/composables/useDestinationSearch'
import { useNavigation } from '@/composables/useNavigation'
import { useServicePatterns } from '@/composables/useServicePatterns'
import { buildResultsQuery, namedPositionFromQuery } from '@/services/resultsQuery'
import type { NamedPosition, SearchResult } from '@/types'

interface DestinationSearchScreenOptions {
  homeRouteName: string
  resultsRouteName: string
}

/**
 * Shared destination-search screen logic for the Map (/search) and
 * List (/list/search) variants: same input/cascade behavior, only the
 * target route names differ.
 *
 * Both origin and destination are shown and editable at once. Tapping a
 * field activates it (clears it for a fresh search, focuses it); picking a
 * result fills that field and, once both fields have a value, navigates to
 * results - otherwise activates the other field so the trip can be
 * completed without bouncing back to Home.
 */
export function useDestinationSearchScreen({ homeRouteName, resultsRouteName }: DestinationSearchScreenOptions) {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
  const { results, loading, search } = useDestinationSearch()
  const { goBack: navGoBack } = useNavigation()

  // Frozen at entry: true when opened via "edit origin/destination" from an
  // already-complete search (see useItinerarySearch.ts's goEdit) - both
  // sides are present in that case regardless of which one is being
  // edited. Determines goBack()'s target, not reactive to later edits.
  const cameFromEdit = route.query.destLat !== undefined

  const originState = ref<NamedPosition | null>(
    route.query.originLat !== undefined ? namedPositionFromQuery(route.query, 'origin', t('common.myPosition')) : null,
  )
  const destState = ref<NamedPosition | null>(
    route.query.destLat !== undefined ? namedPositionFromQuery(route.query, 'dest') : null,
  )
  const activeField = ref<'origin' | 'destination'>(route.query.field === 'origin' ? 'origin' : 'destination')

  // What's actually being typed into the active field right now - the
  // inactive field instead displays its resolved name (see the view).
  const liveQuery = ref('')
  const hasQuery = computed(() => liveQuery.value.trim().length > 0)

  const originInputEl = ref<HTMLInputElement | null>(null)
  const destInputEl = ref<HTMLInputElement | null>(null)
  function activeInputEl(): HTMLInputElement | null {
    return (activeField.value === 'origin' ? originInputEl : destInputEl).value
  }

  // Advanced search: hidden by default (see DestinationSearchView.vue),
  // opened on demand. Empty date/time means "plan for right now" - only
  // included in the results query when the user actually picked one.
  const advancedSearchOpen = ref(false)
  const selectedDate = ref('')
  const selectedTime = ref('')
  const { ensureLoaded: loadPatterns, dateMin, dateMax, needsConnection } = useServicePatterns()
  const dateNeedsConnection = computed(() => needsConnection(selectedDate.value))

  async function toggleAdvancedSearch(): Promise<void> {
    advancedSearchOpen.value = !advancedSearchOpen.value
    if (advancedSearchOpen.value) loadPatterns()
  }

  function setActiveField(field: 'origin' | 'destination'): void {
    activeField.value = field
    liveQuery.value = ''
    search('')
    nextTick(() => activeInputEl()?.focus())
  }

  onMounted(async () => {
    await nextTick()
    activeInputEl()?.focus()
  })

  function onFieldInput(event: Event): void {
    liveQuery.value = (event.target as HTMLInputElement).value
    search(liveQuery.value)
  }

  function selectResult(result: SearchResult): void {
    const picked: NamedPosition = { lat: result.lat, lon: result.lon, name: result.name }
    if (activeField.value === 'origin') originState.value = picked
    else destState.value = picked

    if (originState.value && destState.value) {
      router.push({
        name: resultsRouteName,
        query: buildResultsQuery(
          originState.value, destState.value, undefined,
          { date: selectedDate.value || undefined, time: selectedTime.value ? `${selectedTime.value}:00` : undefined },
        ),
      })
      return
    }

    setActiveField(activeField.value === 'origin' ? 'destination' : 'origin')
  }

  function goBack(): void {
    navGoBack(() => {
      if (cameFromEdit && originState.value && destState.value) {
        router.push({
          name: resultsRouteName,
          query: buildResultsQuery(originState.value, destState.value),
        })
        return
      }
      router.push({ name: homeRouteName })
    })
  }

  return {
    results, loading, hasQuery, onInput: onFieldInput, selectResult, goBack,
    activeField, setActiveField, liveQuery, originState, destState, originInputEl, destInputEl,
    advancedSearchOpen, toggleAdvancedSearch, selectedDate, selectedTime, dateMin, dateMax, dateNeedsConnection,
  }
}
