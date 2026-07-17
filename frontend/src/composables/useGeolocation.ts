import { ref } from 'vue'
import { useCityStore } from '@/stores/city'
import { track } from '@/composables/useAnalytics'
import type { GeoPosition } from '@/types'

export function useGeolocation() {
  const city = useCityStore()
  const position = ref<GeoPosition | null>(null)
  const loading = ref(false)
  const usedFallback = ref(false)
  // null when ok; GeolocationPositionError.code when failed (1=denied, 2=unavailable, 3=timeout)
  const errorCode = ref<number | null>(null)

  function locate(): Promise<GeoPosition> {
    return new Promise((resolve) => {
      const fallback: GeoPosition = city.activeCity.center
      if (!('geolocation' in navigator)) {
        usedFallback.value = true
        errorCode.value = 1
        position.value = fallback
        track('geolocation-fallback', { reason: 'not-supported' })
        resolve(fallback)
        return
      }
      loading.value = true

      // iOS silently drops getCurrentPosition when not called from a user gesture
      // — neither callback ever fires, leaving the Promise hanging. This safety net
      // falls back to city center after 10 s so the UI is never stuck loading.
      const safetyTimer = setTimeout(() => {
        loading.value = false
        usedFallback.value = true
        errorCode.value = 2
        position.value = fallback
        track('geolocation-fallback', { reason: 'ios-silent-drop' })
        resolve(fallback)
      }, 10_000)

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(safetyTimer)
          const result: GeoPosition = { lat: pos.coords.latitude, lon: pos.coords.longitude }
          position.value = result
          usedFallback.value = false
          errorCode.value = null
          loading.value = false
          track('geolocation-granted')
          resolve(result)
        },
        (err) => {
          clearTimeout(safetyTimer)
          position.value = fallback
          usedFallback.value = true
          errorCode.value = err.code
          loading.value = false
          const reason = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable'
          track('geolocation-fallback', { reason })
          resolve(fallback)
        },
        { timeout: 8000, maximumAge: 60_000 },
      )
    })
  }

  return { position, loading, usedFallback, errorCode, locate }
}
