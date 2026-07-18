<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/shared/PageHeader.vue'
import SettingsButton from '@/components/shared/SettingsButton.vue'
import ListRow from '@/components/shared/ListRow.vue'
import LineBadge from '@/components/shared/LineBadge.vue'
import MapStopPanel from '@/components/shared/MapStopPanel.vue'
import RowActionHint from '@/components/shared/RowActionHint.vue'
import { useRoutesList } from '@/composables/useLocalRoutes'
import { useFavoritesStore } from '@/stores/favorites'
import { useCityStore } from '@/stores/city'
import { useNavigation } from '@/composables/useNavigation'
import { useAgencies, lineKey } from '@/composables/useAgencies'
import { haversineMeters } from '@/services/geo'
import { track } from '@/composables/useAnalytics'
import { IconStar, IconStarFilled, IconCurrentLocation, IconMap } from '@tabler/icons-vue'
import type { Route } from '@/types'

// Dynamic import: MiniMap pulls in MapLibre GL (~284KB gzip) and should
// only be fetched when showMap turns true. A static import would load
// MapLibre as soon as this view activates, even before the user taps the map toggle.
const MiniMap = defineAsyncComponent(() => import('@/components/map/MiniMap.vue'))

const { t } = useI18n()
const { openStop, openLine } = useNavigation()
const { routes, loading } = useRoutesList()
const favorites = useFavoritesStore()
const city = useCityStore()
const { hasMultipleAgencies } = useAgencies()

const showMap = ref(false)
const highlightedLine = ref<Route | null>(null)
const mapSelectedStop = ref<{ id: string; name: string } | null>(null)
const keepMapView = ref(false)

const miniMap = ref<InstanceType<typeof MiniMap> | null>(null)
const locating = ref(false)
// Set once "near me" is tapped - filters the badges-strip down to lines
// with at least one stop within the city's own nearbyRadiusMeters (the
// same distance used for nearby-stops elsewhere, e.g. useLocalStops.ts).
// The map's own native GeolocateControl (triggered below) already frames
// the user's position and draws its own "you are here" dot - this is just
// the equivalent for the strip, which the control knows nothing about.
const nearbyLineKeys = ref<Set<string> | null>(null)

function onGeolocate(pos: { lat: number; lon: number }) {
  locating.value = false
  const radius = city.activeCity.nearbyRadiusMeters
  const nearby = new Set<string>()
  for (const route of routes.value) {
    const isNear = route.directions.some((dir) =>
      dir.stops.some((stop) => haversineMeters(pos.lat, pos.lon, stop.lat, stop.lon) <= radius),
    )
    if (isNear) nearby.add(lineKey(route.agencyId, route.shortName))
  }
  nearbyLineKeys.value = nearby
  track('lines-near-me', { city: city.activeSlug, count: nearby.size })
}

function onGeolocateError() {
  locating.value = false
}

// The same button doubles as the way out of "near me" mode - once active,
// tapping it again just clears the filter instead of re-locating. Getting
// the position, framing the map, and showing the "you are here" dot are
// all the native GeolocateControl's own job (see MiniMap's exposed
// triggerGeolocate) - this only starts that request and reacts to its
// result via the geolocate/geolocate-error events below.
function toggleNearby() {
  if (nearbyLineKeys.value) {
    nearbyLineKeys.value = null
    // Turns the control fully off (it's ACTIVE_LOCK at this point, since a
    // successful geolocate is what got us into "near me" mode) before our
    // own resetView() moves the camera away. Skipping this left the control
    // in its BACKGROUND state instead of OFF - trigger() from BACKGROUND
    // just resumes from a cached position without firing a fresh geolocate
    // event, so a second "near me" tap never resolved locating and got
    // stuck on "Loading...".
    miniMap.value?.triggerGeolocate()
    miniMap.value?.resetView()
  } else {
    locating.value = miniMap.value?.triggerGeolocate() ?? false
  }
}

const stripRoutes = computed(() =>
  nearbyLineKeys.value
    ? routes.value.filter((r) => nearbyLineKeys.value!.has(lineKey(r.agencyId, r.shortName)))
    : routes.value,
)

const highlightedKey = computed(() =>
  highlightedLine.value
    ? lineKey(highlightedLine.value.agencyId, highlightedLine.value.shortName)
    : undefined,
)

// One destination variant per line is enough for an overview map with 40+
// lines at once - drawing every branch of every line would be unreadable.
// Exception: the highlighted line gets ALL its variants drawn (dashed,
// beyond the first/primary one) - a single selected line's branches are
// exactly the useful detail a "where does this line actually go" click is
// for, and it's only ever 1-6 extra polylines, not 40 lines' worth.
const mapLegs = computed(() =>
  routes.value.flatMap((route) => {
    const key = lineKey(route.agencyId, route.shortName)
    const dirs = key === highlightedKey.value ? route.directions : route.directions.slice(0, 1)
    return dirs.flatMap((dir, i) => {
      if (!dir.points || dir.points.length === 0) return []
      return [{
        mode: 'BUS' as const,
        points: dir.points,
        routeShortName: route.shortName,
        routeAgencyId: route.agencyId,
        key,
        dashed: i > 0,
      }]
    })
  }),
)

const highlightedStops = computed(() => {
  if (!highlightedLine.value) return []
  const route = routes.value.find(
    (r) => lineKey(r.agencyId, r.shortName) === highlightedKey.value,
  )
  if (!route) return []
  // All variants' stops merged (deduped) - matches the dashed branches now
  // drawn for the highlighted line, instead of just its primary one.
  const seen = new Set<string>()
  const stops = []
  for (const dir of route.directions) {
    for (const s of dir.stops) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      stops.push(s)
    }
  }
  return stops
})

function isHighlighted(route: Route): boolean {
  return highlightedKey.value === lineKey(route.agencyId, route.shortName)
}

function setTab(map: boolean) {
  showMap.value = map
  if (!map) {
    highlightedLine.value = null
    nearbyLineKeys.value = null
  } else {
    track('map-network-opened')
  }
}

// In list mode tapping a row navigates to that line's detail.
// In map mode the same tap selects/deselects the line on the map -
// the two would otherwise compete for the same gesture.
function onRowClick(route: Route) {
  if (showMap.value) {
    highlightedLine.value = isHighlighted(route) ? null : route
  } else {
    openLine(route.shortName)
  }
}

function toggleFavorite(route: Route) {
  favorites.toggleFavoriteLine({
    shortName: route.shortName,
    longName: route.longName,
    agencyId: route.agencyId,
    city: city.activeSlug,
  })
}

// A line chip tapped inside the stop popup (map mode only, since that's the
// popup's only entry point) highlights it on the network map, same as
// tapping its badge in the strip below - but keeps the popup open and the
// view exactly where it was: the user is already looking at the stop that
// matters to them, jumping/zooming away from it would defeat the point of
// checking "which of these lines do I want" from here.
function selectLineFromPanel(agencyId: string, shortName: string) {
  const route = routes.value.find((r) => lineKey(r.agencyId, r.shortName) === lineKey(agencyId, shortName))
  if (!route) return
  keepMapView.value = true
  highlightedLine.value = route
  // Reset after this change has propagated to MiniMap's render(), so a
  // later badge-strip tap still gets the normal fit-to-line behavior.
  nextTick(() => { keepMapView.value = false })
}
</script>

<template>
  <div class="screen">
    <PageHeader :eyebrow="t('lines.eyebrow')" :title="t('nav.lines')">
      <SettingsButton />
    </PageHeader>

    <div class="segmented segmented--inset">
      <button type="button" :class="{ active: !showMap }" @click="setTab(false)">
        {{ t('lines.tabList') }}
      </button>
      <button type="button" :class="{ active: showMap }" @click="setTab(true)">
        {{ t('lines.tabMap') }}
      </button>
    </div>

    <!-- FULLSCREEN MAP MODE -->
    <template v-if="showMap">
      <div class="map-wrap">
        <MiniMap ref="miniMap" mode="network" :route-legs="mapLegs" :highlighted-key="highlightedKey" :stops="highlightedStops" :keep-view="keepMapView" @stop-click="(s) => mapSelectedStop = { id: s.id ?? '', name: s.name ?? '' }" @geolocate="onGeolocate" @geolocate-error="onGeolocateError" />
        <button type="button" class="btn btn--primary locate-btn" :disabled="locating" @click="toggleNearby">
          <IconMap v-if="nearbyLineKeys" :size="18" />
          <IconCurrentLocation v-else :size="18" />
          {{ locating ? t('common.loading') : (nearbyLineKeys ? t('lines.allMap') : t('lines.nearMe')) }}
        </button>
      </div>
      <div class="badges-strip">
        <button
          v-for="route in stripRoutes"
          :key="lineKey(route.agencyId, route.shortName)"
          type="button"
          class="badge-item"
          :class="{ 'badge-item--selected': isHighlighted(route) }"
          @click="onRowClick(route)"
        >
          <LineBadge :short-name="route.shortName" :agency-id="route.agencyId" />
        </button>
      </div>
    </template>

    <!-- LIST MODE -->
    <template v-else>
      <div class="screen-content sheet pattern-tile-bg">
        <div class="content-inner">
          <p v-if="loading" class="status-text">{{ t('common.loading') }}</p>
          <ListRow
            v-for="route in routes"
            :key="lineKey(route.agencyId, route.shortName)"
            tag="div"
            @click="onRowClick(route)"
          >
            <template #leading>
              <LineBadge :short-name="route.shortName" :agency-id="route.agencyId" />
            </template>
            <span class="line-name">{{ route.longName }}</span>
            <span v-if="hasMultipleAgencies" class="line-agency">{{ route.agencyName }}</span>
            <template #trailing>
              <button
                type="button"
                class="fav-btn"
                :class="{ saved: favorites.isFavoriteLine(route.agencyId, route.shortName, city.activeSlug) }"
                :aria-label="t('common.favorite')"
                @click.stop="toggleFavorite(route)"
              >
                <IconStarFilled v-if="favorites.isFavoriteLine(route.agencyId, route.shortName, city.activeSlug)" :size="16" />
                <IconStar v-else :size="16" />
              </button>
              <RowActionHint :label="t('common.viewLine')" />
            </template>
          </ListRow>
        </div>
      </div>
    </template>

    <MapStopPanel
      v-if="mapSelectedStop"
      :stop-id="mapSelectedStop.id"
      :stop-name="mapSelectedStop.name"
      @close="mapSelectedStop = null"
      @view-stop="(id) => { mapSelectedStop = null; openStop(id) }"
      @select-line="selectLineFromPanel"
    />
  </div>
</template>

<style scoped>
/* The tab bar must never shrink when map mode's flexible children fight
   for vertical space. */
.segmented {
  flex: none;
}

/* --- MAP MODE -------------------------------------------------------- */

/* Fills everything between segmented and badges-strip. */
.map-wrap {
  position: relative;
  flex: 1;
  overflow: hidden;
}

.locate-btn {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sheet);
  white-space: nowrap;
}

.badges-strip {
  flex: none;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  background: var(--color-nav-bg);
  border-top: 1px solid var(--color-border);
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.badges-strip::-webkit-scrollbar { display: none; }

.badge-item {
  flex: none;
  border-radius: var(--radius-sm);
  transition: box-shadow var(--duration-fast);
}

/* Double ring: inner white gap + outer accent — visible on any badge
   color since the white gap separates badge from accent ring. */
.badge-item--selected {
  box-shadow: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-accent);
}

.line-name {
  font: var(--text-label-strong);
  color: var(--color-text);
}

.line-agency {
  font: var(--text-caption-sm);
  color: var(--color-muted);
  margin-top: 2px;
}


</style>
