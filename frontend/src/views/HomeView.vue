<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { buildResultsQuery } from '@/services/resultsQuery'
import { toMapLeg } from '@/map/geometry'
import type { NamedPosition, MapLeg } from '@/types'
import SettingsButton from '@/components/shared/SettingsButton.vue'
import MiniMap from '@/components/map/MiniMap.vue'
import LogoPill from '@/components/home/LogoPill.vue'
import SearchCard from '@/components/shared/SearchCard.vue'
import StopPreviewCard from '@/components/home/StopPreviewCard.vue'
import ModeFilterBar from '@/components/shared/ModeFilterBar.vue'
import { IconMapPinOff, IconBus, IconBusStop } from '@tabler/icons-vue'
import { useNearbyStops } from '@/composables/useLocalStops'
import { useAllCityStops } from '@/composables/useAllCityStops'
import { useRoutesList } from '@/composables/useLocalRoutes'
import { useOriginLocation } from '@/composables/useOriginLocation'
import { useNavigation } from '@/composables/useNavigation'
import { useTransitModeFilter } from '@/composables/useTransitModeFilter'
import { useDeviceHeading } from '@/composables/useDeviceHeading'
import { useCityStore } from '@/stores/city'
import type { Stop } from '@/types'

const router = useRouter()
const { t } = useI18n()
const appUrl = import.meta.env.VITE_APP_URL ?? '/'
const { fetchNearby } = useNearbyStops()       // still used for origin geolocation flow
const { stops: allStops } = useAllCityStops()  // all city stops for the map
const { routes: allRoutes } = useRoutesList()  // for selectedStopLegs below
const { openStop: openStopView } = useNavigation()
const city = useCityStore()
const selectedStop   = ref<Stop | null>(null)
const gpsPosition    = ref<[number, number] | null>(null)   // live GPS fix → pulse marker
const pickedOrigin   = ref<{ lat: number; lon: number } | null>(null)  // map-pick → flag marker
const locationDenied = ref(false)

// Direction cone on the "you are here" dot. Android/desktop don't gate this
// sensor behind any permission at all, so it just auto-attaches on mount -
// no button needed. iOS does gate it, but only behind a prompt that must
// fire inside a direct user tap, which nothing on this page offers; rather
// than add a dedicated permission button just for iOS (confusing next to
// the map's own zoom-to-north controls - easy to read as "point map
// north" instead of "show which way I'm facing"), iOS simply doesn't get
// the cone.
const { supported: compassSupported, needsPermission: compassNeedsPermission, heading: compassHeading, requestPermission: requestCompass } = useDeviceHeading()
onMounted(() => {
  if (compassSupported && !compassNeedsPermission) requestCompass()
})

// navigator.standalone is true only on iOS when launched from the home screen.
// In that context, geolocation permission must be granted in Safari first.
const isIosPwa =
  typeof navigator !== 'undefined' &&
  (navigator as Navigator & { standalone?: boolean }).standalone === true

// Exact gap between .map-zone's own bottom edge and the top of whichever
// card is currently in .bottom-overlay (SearchCard or StopPreviewCard -
// not the same height, and SearchCard's own height already varies with its
// hint line) - measured directly via getBoundingClientRect rather than
// reconstructed from the card's height plus assumed offsets, which didn't
// match its real box and left .map-layers-toggle overlapping the card.
const toggleBottomSpace = ref(90)
let bottomOverlayObserver: ResizeObserver | null = null

function measureToggleBottomSpace() {
  const zone = document.querySelector('.map-zone')
  const card = document.querySelector('.map-zone .bottom-overlay')
  if (!zone || !card) return
  const zoneRect = zone.getBoundingClientRect()
  const cardRect = card.getBoundingClientRect()
  toggleBottomSpace.value = zoneRect.bottom - cardRect.top + 10 // 10px clearance above the card
}

onMounted(() => {
  nextTick(() => {
    const card = document.querySelector('.map-zone .bottom-overlay')
    if (!card) return
    measureToggleBottomSpace()
    bottomOverlayObserver = new ResizeObserver(measureToggleBottomSpace)
    bottomOverlayObserver.observe(card)
    window.addEventListener('resize', measureToggleBottomSpace)
  })
})
onUnmounted(() => {
  bottomOverlayObserver?.disconnect()
  window.removeEventListener('resize', measureToggleBottomSpace)
})

// The nearby-stops radius is per-city (see frontend/src/cities.ts),
// fetchNearby reads it from the active city.
const { origin, geoErrorCode, setOrigin, goSearchOrigin, goSearchDestination } = useOriginLocation({
  homeRouteName: 'home',
  searchRouteName: 'search',
  onOriginSet: (lat, lon) => fetchNearby(lat, lon),
})
const {
  availableModes, showFilter: showModeFilter, isActive: isModeActive, toggle: toggleMode,
  matchesFilter, matchesStopFilter,
} = useTransitModeFilter()

// Stops layer: on by default (the map's original purpose - "which stops
// are near me"). Lines layer: off by default - a full network draw is a
// lot of overlapping color at city-wide zoom (see the exploration in chat:
// mostly a clutter problem, not a data-cost one, since allRoutes above is
// already fetched for selectedStopLegs regardless of this toggle).
const showStops = ref(true)
const showRoutes = ref(false)

const filteredStops = computed(() => (showStops.value ? allStops.value.filter(matchesStopFilter) : []))

// One leg per route (its primary direction only), same simplification
// LinesView's own overview uses - every branch of every line at once
// would be unreadable here too.
const allRoutesLegs = computed<MapLeg[]>(() =>
  allRoutes.value.filter(matchesFilter).flatMap((route): MapLeg[] => {
    const dir = route.directions[0]
    if (!dir?.points?.length) return []
    return [toMapLeg(route, dir)]
  }),
)
// A selected stop always wins over the "show all lines" toggle - same
// declutter effect as when that toggle is off, so picking a stop reads the
// same way regardless of whether the full network was showing a moment ago.
const mapRouteLegs = computed(() =>
  selectedStop.value ? selectedStopLegs.value : (showRoutes.value ? allRoutesLegs.value : []),
)

// stop id -> legs of every direction passing through it, built once per
// allRoutes load rather than rescanning every route/direction on each stop
// tap (selectedStopLegs below used to do exactly that scan per tap - a
// full-network scan on the main thread every time a stop preview opens).
const legsByStopId = computed(() => {
  const index = new Map<string, MapLeg[]>()
  for (const route of allRoutes.value) {
    for (const dir of route.directions) {
      if (!dir.points?.length) continue
      const leg = toMapLeg(route, dir)
      for (const s of dir.stops) {
        const legs = index.get(s.id)
        if (legs) legs.push(leg)
        else index.set(s.id, [leg])
      }
    }
  }
  return index
})

// Lines serving the currently previewed stop, drawn on the map the same way
// LinesView highlights a line - lets a rider see where each of a stop's
// lines actually goes without leaving the map. A stop can appear in more
// than one direction of the same route (both sides of an out-and-back line
// sharing one platform) - each matching direction gets its own leg.
const selectedStopLegs = computed<MapLeg[]>(() =>
  selectedStop.value ? legsByStopId.value.get(selectedStop.value.id) ?? [] : [],
)

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
  openStopView(selectedStop.value.id)
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
      <MiniMap mode="search" pick-menu style="--map-ctrl-top-extra: 60px" :center="originCenter" :stops="filteredStops" :route-legs="mapRouteLegs" :selected-stop-id="selectedStop?.id" :user-position="gpsPosition ?? undefined" :heading-deg="compassHeading" :picked-point="pickedOrigin ?? undefined" @stop-click="openStop" @pick-origin="onPickOrigin" @pick-destination="onPickDestination" @geolocate="onMapGeolocate" @geolocate-error="onMapGeolocateError" />
      <div class="top-bar">
        <div class="top-bar-spacer" aria-hidden="true" />
        <LogoPill />
        <SettingsButton class="settings-btn-corner" />
      </div>
      <div class="map-layers-toggle" :style="{ '--toggle-bottom-space': toggleBottomSpace + 'px' }">
        <button
          type="button"
          class="layer-toggle-btn"
          :class="{ active: showStops }"
          :aria-pressed="showStops"
          @click="showStops = !showStops"
        >
          <IconBusStop :size="16" aria-hidden="true" />
          {{ t('home.stopsLayer') }}
        </button>
        <button
          type="button"
          class="layer-toggle-btn"
          :class="{ active: showRoutes }"
          :aria-pressed="showRoutes"
          @click="showRoutes = !showRoutes"
        >
          <IconBus :size="16" aria-hidden="true" />
          {{ t('home.linesLayer') }}
        </button>
      </div>
      <div v-if="showModeFilter" class="mode-filter-overlay">
        <ModeFilterBar :modes="availableModes" :is-active="isModeActive" @toggle="toggleMode" />
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

/* Stacked directly above .bottom-overlay (SearchCard/StopPreviewCard),
   right-aligned to its own right edge - same left/right/max-width/margin
   centering rule as .bottom-overlay itself (see below), so the two align
   exactly regardless of viewport width, instead of independently guessing
   where that edge lands. --toggle-bottom-space is measured live (see
   measureToggleBottomSpace) as the actual gap to the card's top edge. */
.map-layers-toggle {
  position: absolute;
  left: 14px;
  right: 14px;
  bottom: var(--toggle-bottom-space, 90px);
  z-index: 5;
  max-width: calc(var(--content-max-width) - 28px);
  margin: 0 auto;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  gap: 8px;
}

.layer-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-text);
  font: var(--text-label-strong);
  box-shadow: var(--shadow-card);
  white-space: nowrap;
}

.layer-toggle-btn.active {
  background: var(--color-accent);
  color: var(--color-accent-text);
}

/* Below .top-bar (logo + settings), same anchor the MapLibre controls
   below use - see the :deep(.maplibregl-ctrl-top-right) rule. */
.mode-filter-overlay {
  position: absolute;
  top: 64px;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  justify-content: center;
}

.mode-filter-overlay :deep(.mode-filter-bar) {
  background: var(--color-surface);
  border-radius: var(--radius-full);
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
