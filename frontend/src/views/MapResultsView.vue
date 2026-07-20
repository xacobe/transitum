<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import RouteHeader from '@/components/results/RouteHeader.vue'
import MiniMap from '@/components/map/MiniMap.vue'
import ItineraryResultsList from '@/components/results/ItineraryResultsList.vue'
import ModeFilterBar from '@/components/shared/ModeFilterBar.vue'
import { useItinerarySearch, busLinesOf } from '@/composables/useItinerarySearch'
import { track } from '@/composables/useAnalytics'
import { useOfflineError } from '@/composables/useOfflineError'
import { buildResultsQuery } from '@/services/resultsQuery'
import { IconList } from '@tabler/icons-vue'
import type { Itinerary } from '@/types'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

const {
  itineraries,
  loading,
  error,
  isOffline,
  isNextAvailable,
  sortMode,
  selectedItinerary,
  fromLat,
  fromLon,
  toLat,
  toLon,
  fromName,
  toName,
  serviceOpen,
  uniqueItineraries,
  sortedItineraries,
  activeItinerary,
  availableModes,
  showModeFilter,
  isModeActive,
  toggleMode,
  goBack,
  swapOriginDestination,
  goEditOrigin,
  goEditDestination,
} = useItinerarySearch({ backRouteName: 'home', selfRouteName: 'mapResults', searchRouteName: 'search' })

const isOfflineError = useOfflineError(error)

function selectItinerary(itinerary: Itinerary, index: number) {
  selectedItinerary.value = itinerary
  track('itinerary-selected', {
    index,
    lines: busLinesOf(itinerary).join(',') || 'walk',
    transfers: busLinesOf(itinerary).length - 1,
    durationMin: Math.round(itinerary.duration / 60),
  })
}

const fromPoint = computed<[number, number] | undefined>(() =>
  Number.isNaN(fromLat.value) ? undefined : [fromLat.value, fromLon.value],
)
const toPoint = computed<[number, number] | undefined>(() =>
  Number.isNaN(toLat.value) ? undefined : [toLat.value, toLon.value],
)

// If arriving from a favorited itinerary (Favoris -> "lines" in the
// query, see FavorisView.vue/ItineraryCard.vue), preselect the
// alternative that uses those same lines instead of defaulting to the
// first/fastest one - origin/destination alone don't identify WHICH
// alternative was favorited (they all share origin/destination).
const targetLines = computed(() => {
  const raw = route.query.lines
  return raw ? String(raw).split(',').filter(Boolean) : null
})

watch(itineraries, () => {
  if (!targetLines.value || uniqueItineraries.value.length === 0) return
  const lines = targetLines.value
  const match = uniqueItineraries.value.find(
    (it) => busLinesOf(it).join(',') === lines.join(','),
  )
  if (match) selectedItinerary.value = match
})

const mapRouteLegs = computed(() => activeItinerary.value?.mapLegs ?? [])

function viewOnList() {
  router.push({
    name: 'listResults',
    query: buildResultsQuery(
      { lat: fromLat.value, lon: fromLon.value, name: fromName.value },
      { lat: toLat.value, lon: toLon.value, name: toName.value },
    ),
  })
}

function onPickOrigin(pt: { lat: number; lon: number }) {
  router.push({
    name: 'mapResults',
    query: buildResultsQuery(
      { lat: pt.lat, lon: pt.lon, name: t('home.selectedPoint') },
      { lat: toLat.value,   lon: toLon.value,   name: toName.value },
    ),
  })
}

function onPickDestination(pt: { lat: number; lon: number }) {
  router.push({
    name: 'mapResults',
    query: buildResultsQuery(
      { lat: fromLat.value, lon: fromLon.value, name: fromName.value },
      { lat: pt.lat, lon: pt.lon, name: t('home.selectedPoint') },
    ),
  })
}
</script>

<template>
  <div class="screen">
    <RouteHeader
      :from-name="fromName"
      :to-name="toName"
      @back="goBack"
      @swap="swapOriginDestination"
      @edit-from="goEditOrigin"
      @edit-to="goEditDestination"
    />
    <ModeFilterBar
      v-if="showModeFilter"
      :modes="availableModes"
      :is-active="isModeActive"
      @toggle="toggleMode"
    />
    <div class="map-wrap">
      <MiniMap
        mode="route"
        pick-menu
        :from="fromPoint ?? undefined"
        :to="toPoint ?? undefined"
        :route-legs="mapRouteLegs"
        @pick-origin="onPickOrigin"
        @pick-destination="onPickDestination"
      />
    </div>

    <div class="screen-content sheet">
      <div class="content-inner">
        <ItineraryResultsList
          :loading="loading"
          :is-offline-error="isOfflineError"
          :error="error"
          :service-open="serviceOpen"
          :is-offline="isOffline"
          :is-next-available="isNextAvailable"
          :sorted-itineraries="sortedItineraries"
          :sort-mode="sortMode"
          :active-itinerary="activeItinerary"
          :from-name="fromName"
          :to-name="toName"
          @update:sort-mode="sortMode = $event"
          @select="selectItinerary"
        >
          <template #toggle-button>
            <button type="button" class="view-toggle-btn" @click="viewOnList">
              <IconList :size="14" aria-hidden="true" />
              {{ t('results.viewOnList') }}
            </button>
          </template>
        </ItineraryResultsList>
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-wrap {
  flex: none;
  height: 50%;
}

/* Tighter than the module default: the map above already provides the
   breathing room this half-height sheet would otherwise pad for. */
.sheet {
  padding: 15px 14px;
}

.view-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  border-radius: var(--radius-card);
  background: var(--color-low-bg);
  color: var(--color-low-text);
  font: var(--text-caption);
  font-weight: 700;
}
</style>
