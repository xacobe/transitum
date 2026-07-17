import { defineStore } from 'pinia'
import { CITIES, DEFAULT_CITY_SLUG, getCity } from '@/cities'
import { haversineMeters } from '@/services/geo'
import { track } from '@/composables/useAnalytics'
import type { CityConfig, GeoPosition } from '@/types'

const STORAGE_KEY = 'transit_city'

// Beyond this distance, no city in the registry is "the local one" - the
// default city is used instead of guessing (e.g. someone trying the app
// from outside any deployed city's area).
const AUTO_DETECT_MAX_KM = 80

// Own geolocation (not useGeolocation.ts): that composable uses the
// active city's center as a fallback, which would be circular here
// (there's no active city yet to use as a fallback on first launch).
function detectPosition(): Promise<GeoPosition | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 },
    )
  })
}

async function detectNearestCitySlug(): Promise<string | null> {
  const pos = await detectPosition()
  if (!pos) return null

  let nearestSlug: string | null = null
  let nearestDist = Infinity
  for (const city of CITIES) {
    const dist = haversineMeters(pos.lat, pos.lon, city.center.lat, city.center.lon)
    if (dist < nearestDist) {
      nearestSlug = city.slug
      nearestDist = dist
    }
  }
  return nearestDist <= AUTO_DETECT_MAX_KM * 1000 ? nearestSlug : null
}

export const useCityStore = defineStore('city', {
  state: (): { activeSlug: string } => ({
    activeSlug: DEFAULT_CITY_SLUG,
  }),
  getters: {
    activeCity: (state): CityConfig => getCity(state.activeSlug),
  },
  actions: {
    async init(): Promise<void> {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && CITIES.some((c) => c.slug === saved)) {
        this.activeSlug = saved
        return
      }
      const detected = await detectNearestCitySlug()
      this.activeSlug = detected ?? DEFAULT_CITY_SLUG
      localStorage.setItem(STORAGE_KEY, this.activeSlug)
    },
    setCity(slug: string): void {
      if (!CITIES.some((c) => c.slug === slug)) return
      this.activeSlug = slug
      localStorage.setItem(STORAGE_KEY, slug)
      track('city-changed', { city: slug })
    },
  },
})
