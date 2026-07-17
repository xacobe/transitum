import { ref, watch } from 'vue'
import { loadCityStops } from '@/services/cityData'
import { useCityStore } from '@/stores/city'
import type { Stop } from '@/types'

export function useAllCityStops() {
  const city = useCityStore()
  const stops = ref<Stop[]>([])

  async function load() {
    stops.value = await loadCityStops(city.activeSlug)
  }

  watch(() => city.activeSlug, load, { immediate: true })

  return { stops }
}
