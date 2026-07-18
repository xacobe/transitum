import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDestinationSearch } from '@/composables/useDestinationSearch'
import { useNavigation } from '@/composables/useNavigation'
import { buildResultsQuery } from '@/services/resultsQuery'
import type { SearchResult } from '@/types'

interface DestinationSearchScreenOptions {
  homeRouteName: string
  resultsRouteName: string
}

/**
 * Shared destination-search screen logic for the Carte (/recherche) and
 * Liste (/liste/recherche) variants: same input/cascade behavior, only the
 * target route names differ.
 */
export function useDestinationSearchScreen({ homeRouteName, resultsRouteName }: DestinationSearchScreenOptions) {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
  const { results, loading, search } = useDestinationSearch()
  const { goBack: navGoBack } = useNavigation()

  const field = computed<'origin' | 'destination'>(() =>
    route.query.field === 'origin' ? 'origin' : 'destination',
  )
  const placeholder = computed(() =>
    field.value === 'origin' ? t('search.placeholderOrigin') : t('search.placeholderDestination'),
  )
  // Set when reopened from Resultats to edit one side of an already
  // calculated itinerary — lets us send the user back there and keep the
  // other side of the search intact.
  const hasDestination = computed(() => route.query.destLat !== undefined)

  const query = ref('')
  const inputEl = ref<HTMLInputElement | null>(null)
  const hasQuery = computed(() => query.value.trim().length > 0)

  onMounted(async () => {
    await nextTick()
    inputEl.value?.focus()
  })

  function onInput(): void {
    search(query.value)
  }

  function selectResult(result: SearchResult): void {
    if (field.value === 'origin') {
      if (hasDestination.value) {
        router.push({
          name: resultsRouteName,
          query: buildResultsQuery(
            { lat: result.lat, lon: result.lon, name: result.name },
            { lat: Number(route.query.destLat), lon: Number(route.query.destLon), name: (route.query.destName as string) ?? '' },
          ),
        })
        return
      }
      router.push({ name: homeRouteName, query: { originLat: result.lat, originLon: result.lon, originName: result.name } })
      return
    }

    router.push({
      name: resultsRouteName,
      query: buildResultsQuery(
        { lat: Number(route.query.originLat), lon: Number(route.query.originLon), name: (route.query.originName as string) ?? t('common.myPosition') },
        { lat: result.lat, lon: result.lon, name: result.name },
      ),
    })
  }

  function goBack(): void {
    navGoBack(() => {
      if (hasDestination.value) {
        router.push({
          name: resultsRouteName,
          query: buildResultsQuery(
            { lat: Number(route.query.originLat), lon: Number(route.query.originLon), name: (route.query.originName as string) ?? '' },
            { lat: Number(route.query.destLat), lon: Number(route.query.destLon), name: (route.query.destName as string) ?? '' },
          ),
        })
        return
      }
      router.push({ name: homeRouteName })
    })
  }

  return { results, loading, placeholder, query, inputEl, hasQuery, onInput, selectResult, goBack }
}
