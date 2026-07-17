import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useGeolocation } from '@/composables/useGeolocation'
import { useCityStore } from '@/stores/city'
import type { NamedPosition } from '@/types'

interface OriginLocationOptions {
  homeRouteName?: string
  searchRouteName?: string
  onOriginSet?: (lat: number, lon: number, name: string) => Promise<void> | void
}

/**
 * Shared origin/geolocation bootstrapping for the Carte (Home) and Liste
 * (ListHome) entry screens: reads ?originLat/originLon/originName from the
 * route on mount (coming back from the destination search screen),
 * otherwise geolocates. Recomputes when the active city is switched.
 */
export function useOriginLocation({ homeRouteName, searchRouteName, onOriginSet }: OriginLocationOptions = {}) {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
  const { locate, errorCode: geoErrorCode } = useGeolocation()
  const city = useCityStore()

  const origin = ref<NamedPosition | null>(null)
  const locating = ref(false)

  async function setOrigin(lat: number, lon: number, name: string): Promise<void> {
    origin.value = { lat, lon, name }
    await onOriginSet?.(lat, lon, name)
  }

  async function refreshLocation(): Promise<void> {
    if (locating.value) return
    locating.value = true
    try {
      const pos = await locate()
      await setOrigin(pos.lat, pos.lon, t('common.myPosition'))
    } finally {
      locating.value = false
    }
  }

  onMounted(() => {
    const { originLat, originLon, originName } = route.query
    if (originLat && originLon) {
      setOrigin(Number(originLat), Number(originLon), (originName as string) ?? t('common.myPosition'))
      router.replace({ name: homeRouteName })
    } else {
      refreshLocation()
    }
  })

  watch(() => city.activeSlug, refreshLocation)

  function goSearch(field: 'origin' | 'destination'): void {
    if (!origin.value) return
    const r = (n: number) => Math.round(n * 1e4) / 1e4 // ~11 m precision
    router.push({
      name: searchRouteName,
      query: { field, originLat: r(origin.value.lat), originLon: r(origin.value.lon), originName: origin.value.name },
    })
  }

  return {
    origin, locating, geoErrorCode, setOrigin, refreshLocation,
    goSearchOrigin: () => goSearch('origin'),
    goSearchDestination: () => goSearch('destination'),
  }
}
