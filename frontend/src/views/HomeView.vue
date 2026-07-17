<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { buildResultsQuery } from '@/services/resultsQuery'
import type { NamedPosition } from '@/types'
import SettingsButton from '@/components/shared/SettingsButton.vue'
import MiniMap from '@/components/map/MiniMap.vue'
import LogoPill from '@/components/home/LogoPill.vue'
import SearchCard from '@/components/shared/SearchCard.vue'
import StopPreviewCard from '@/components/home/StopPreviewCard.vue'
import { IconMapPinOff } from '@tabler/icons-vue'
import { useNearbyStops } from '@/composables/useLocalStops'
import { useAllCityStops } from '@/composables/useAllCityStops'
import { useOriginLocation } from '@/composables/useOriginLocation'
import { useCityStore } from '@/stores/city'
import type { Stop } from '@/types'

const router = useRouter()
const { t } = useI18n()
const appUrl = import.meta.env.VITE_APP_URL ?? '/'
const { fetchNearby } = useNearbyStops()       // still used for origin geolocation flow
const { stops: allStops } = useAllCityStops()  // all city stops for the map
const city = useCityStore()
const selectedStop   = ref<Stop | null>(null)
const gpsPosition    = ref<[number, number] | null>(null)   // live GPS fix → pulse marker
const pickedOrigin   = ref<{ lat: number; lon: number } | null>(null)  // map-pick → flag marker
const locationDenied = ref(false)
// navigator.standalone is true only on iOS when launched from the home screen.
// In that context, geolocation permission must be granted in Safari first.
const isIosPwa =
  typeof navigator !== 'undefined' &&
  (navigator as Navigator & { standalone?: boolean }).standalone === true

// The nearby-stops radius is per-city (see frontend/src/cities.js),
// fetchNearby reads it from the active city.
const { origin, geoErrorCode, setOrigin, goSearchOrigin, goSearchDestination } = useOriginLocation({
  homeRouteName: 'home',
  searchRouteName: 'search',
  onOriginSet: (lat, lon) => fetchNearby(lat, lon),
})

// Show notification when the initial geolocation on mount fails with PERMISSION_DENIED
watch(geoErrorCode, (code) => {
  if (code === 1) locationDenied.value = true
})

// Keep gpsPosition in sync with automatic geolocation from useOriginLocation.
// The GeolocateControl button path is handled in onMapGeolocate; this covers
// the auto-fix that runs on mount (and on city change via refreshLocation).
watch(origin, (o) => {
  if (o?.name === t('common.myPosition')) {
    gpsPosition.value  = [o.lat, o.lon]
    pickedOrigin.value = null
  }
})

const originCenter = computed(() =>
  origin.value ? ([origin.value.lat, origin.value.lon] as [number, number]) : undefined,
)

// Switching city: clear all per-city UI state.
watch(() => city.activeSlug, () => {
  selectedStop.value  = null
  gpsPosition.value   = null
  pickedOrigin.value  = null
})

function openStop(stop: Stop) {
  selectedStop.value = stop
}

function onPickOrigin(pt: { lat: number; lon: number }) {
  pickedOrigin.value = pt
  setOrigin(pt.lat, pt.lon, t('home.selectedPoint'))
}

function onPickDestination(pt: { lat: number; lon: number }) {
  const dest: NamedPosition = { lat: pt.lat, lon: pt.lon, name: t('home.selectedPoint') }
  if (origin.value) {
    router.push({ name: 'mapResults', query: buildResultsQuery(origin.value, dest) })
  } else {
    // No origin yet: go to destination search with the point pre-filled
    router.push({
      name: 'search',
      query: {
        field: 'destination',
        destLat: String(dest.lat), destLon: String(dest.lon), destName: dest.name,
      },
    })
  }
}

function closeStopPreview() {
  selectedStop.value = null
}

function goStopDetails() {
  if (!selectedStop.value) return
  router.push({ name: 'stop', params: { stopId: selectedStop.value.id } })
}

function useStopAsOrigin() {
  if (!selectedStop.value) return
  setOrigin(selectedStop.value.lat, selectedStop.value.lon, selectedStop.value.name)
  selectedStop.value = null
}

function onMapGeolocate({ lat, lon }: { lat: number; lon: number }) {
  locationDenied.value = false
  gpsPosition.value  = [lat, lon]
  pickedOrigin.value = null   // GPS fix replaces any manual map pick
  setOrigin(lat, lon, t('common.myPosition'))
}

function onMapGeolocateError({ code }: { code: number }) {
  if (code === 1) locationDenied.value = true
}
</script>

<template>
  <div class="screen">
    <div class="map-zone">
      <!-- --map-ctrl-top-extra clears the top-bar (logo + settings button) -->
      <MiniMap mode="search" pick-menu style="--map-ctrl-top-extra: 60px" :center="originCenter" :stops="allStops" :user-position="gpsPosition ?? undefined" :picked-point="pickedOrigin ?? undefined" @stop-click="openStop" @pick-origin="onPickOrigin" @pick-destination="onPickDestination" @geolocate="onMapGeolocate" @geolocate-error="onMapGeolocateError" />
      <div class="top-bar">
        <div class="top-bar-spacer" aria-hidden="true" />
        <LogoPill />
        <SettingsButton class="settings-btn-corner" />
      </div>
      <div v-if="locationDenied" class="location-denied" role="alert">
        <IconMapPinOff :size="14" aria-hidden="true" />
        <span>
          <strong>{{ t('home.locationDenied') }}</strong>
          <template v-if="isIosPwa">
            <a :href="appUrl" target="_blank" rel="noopener" class="location-denied-link">
              {{ t('home.locationDeniedPwa') }}
            </a>
          </template>
          <template v-else>
            {{ t('home.locationDeniedHelp') }}
          </template>
        </span>
        <button type="button" class="location-denied-close" :aria-label="t('common.close')" @click="locationDenied = false">×</button>
      </div>
      <SearchCard
        v-if="!selectedStop"
        class="bottom-overlay"
        :origin-name="origin?.name ?? t('common.myPosition')"
        @open-search-origin="goSearchOrigin"
        @open-search-destination="goSearchDestination"
      />
      <StopPreviewCard
        v-if="selectedStop"
        class="bottom-overlay"
        :stop="selectedStop"
        @close="closeStopPreview"
        @go-details="goStopDetails"
        @use-as-origin="useStopAsOrigin"
      />
    </div>
  </div>
</template>

<style scoped>
.map-zone {
  flex: 1;
  position: relative;
}

/* The logo + settings button used to be two separately-pinned corner
   overlays - on a wide desktop viewport (map full-bleed, unlike the
   rest of the app) that put them at the true window edges instead of
   lining up with the content column everywhere else. Grouping them in
   one bar capped to content-max-width fixes that, and centers the logo
   as a side effect (equal-width spacer on the left balances the
   button on the right). */
.top-bar {
  position: absolute;
  top: max(8px, env(safe-area-inset-top));
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 0 16px;
}

.top-bar-spacer {
  width: 38px;
  flex: none;
}

.settings-btn-corner {
  box-shadow: var(--shadow-card);
}

.location-denied {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: calc(14px + 66px + 10px); /* above SearchCard */
  z-index: 7;
  max-width: calc(var(--content-max-width) - 28px);
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-surface);
  border: 1px solid var(--color-warning);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  font: 600 12px var(--font-ui);
  color: var(--color-text);
}

.location-denied strong {
  display: block;
  font-size: 13px;
}

.location-denied-link {
  display: block;
  margin-top: 2px;
  color: var(--color-accent);
  text-decoration: underline;
}

.location-denied-close {
  flex: none;
  margin-left: auto;
  font-size: 18px;
  line-height: 1;
  color: var(--color-muted);
  padding: 0 2px;
}

/* Shift MapLibre's top-right controls below the top-bar and above the
   other overlays so they're visible without blocking the search card. */
:deep(.maplibregl-ctrl-top-right) {
  top: 64px;
  z-index: 6;
}


.bottom-overlay {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: 14px;
  z-index: 5;
  /* Same 14px inset as before on narrow viewports (left/right already
     cover it) - past content-max-width, the inset stops growing and
     the card centers instead of stretching with the map. */
  max-width: calc(var(--content-max-width) - 28px);
  margin: 0 auto;
}
</style>
