<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ItineraryCard from '@/components/results/ItineraryCard.vue'
import ServiceClosedNotice from '@/components/shared/ServiceClosedNotice.vue'
import { IconWifiOff, IconWalk, IconClock } from '@tabler/icons-vue'
import type { Itinerary } from '@/types'

const props = withDefaults(
  defineProps<{
    loading: boolean
    isOfflineError: boolean
    error: Error | null
    serviceOpen: boolean
    isOffline: boolean
    // True when sortedItineraries come from the service-start fallback
    // (see useItineraryPlan.fetchPlan) rather than the requested time -
    // there's no more service today for this trip, but there was earlier.
    isNextAvailable: boolean
    sortedItineraries: Itinerary[]
    sortMode: 'rapide' | 'tot'
    activeItinerary: Itinerary | null
    fromName: string
    toName: string
    separatedHeader?: boolean
    // See ItineraryCard's prop of the same name - ListResultsView sets this
    // false since it already shows a step-by-step breakdown elsewhere (its
    // #detail slot), so the card itself should stay compact. Defaulted here
    // (not left to ItineraryCard's own default) because an explicit
    // :vertical-when-selected="undefined" binding does not fall back to the
    // child's withDefaults value - confirmed live, not just a theoretical
    // concern.
    verticalWhenSelected?: boolean
  }>(),
  { verticalWhenSelected: true },
)

const emit = defineEmits<{
  'update:sortMode': [mode: 'rapide' | 'tot']
  select: [itinerary: Itinerary, index: number]
}>()

const { t } = useI18n()

interface ItineraryGroup {
  boardingStop: string | null
  boardingWalkMin: number
  itineraries: Itinerary[]
}

// Group itineraries by boarding stop. Direct itineraries (no walk to reach
// the bus) come first with no notice. Itineraries that require walking to a
// different nearby stop are grouped by that stop and preceded by a notice.
// GPS/saved-position origins are excluded because walking to a stop is expected.
const groupedItineraries = computed((): ItineraryGroup[] => {
  // Suppress the boarding-notice for any coordinate-based origin: GPS position,
  // saved position, or a point picked directly on the map. In all these cases
  // the user expects to walk to the nearest stop, so the notice adds no value.
  const GPS = new Set([t('common.myPosition'), t('common.savedPosition'), t('home.selectedPoint')])
  if (!props.fromName || GPS.has(props.fromName)) {
    return [{ boardingStop: null, boardingWalkMin: 0, itineraries: props.sortedItineraries }]
  }

  const groupMap = new Map<string, { minWalk: number; stop: string | null; itineraries: Itinerary[] }>()
  for (const it of props.sortedItineraries) {
    const first = it.legs[0]
    const walkMin = first.mode === 'WALK' ? Math.round(first.duration / 60) : 0
    const stop = first.mode === 'WALK' && walkMin > 0 ? (first.to.name || null) : null
    const key = stop ?? '__direct__'
    if (!groupMap.has(key)) groupMap.set(key, { minWalk: walkMin, stop, itineraries: [] })
    const g = groupMap.get(key)!
    if (walkMin < g.minWalk) g.minWalk = walkMin
    g.itineraries.push(it)
  }

  return Array.from(groupMap.entries())
    .sort(([a], [b]) => (a === '__direct__' ? -1 : b === '__direct__' ? 1 : 0))
    .map(([, { minWalk, stop, itineraries }]) => ({
      boardingStop: stop,
      boardingWalkMin: minWalk,
      itineraries,
    }))
})
</script>

<template>
  <ServiceClosedNotice v-if="!serviceOpen" />
  <p v-if="loading" class="status-text">{{ t('common.loading') }}</p>
  <p v-else-if="isOfflineError" class="status-text">{{ t('results.loadErrorOffline') }}</p>
  <p v-else-if="error" class="status-text">{{ t('results.loadError') }}</p>
  <p v-else-if="sortedItineraries.length === 0" class="status-text">{{ t('results.noResults') }}</p>
  <template v-else>
    <div v-if="isOffline" class="offline-notice">
      <IconWifiOff :size="13" aria-hidden="true" />
      {{ t('results.offlineEstimate') }}
    </div>
    <div v-if="isNextAvailable" class="notice notice--warn notice--lg">
      <IconClock :size="18" class="notice__icon" aria-hidden="true" />
      <div class="notice__body">
        <span class="notice__title">{{ t('results.nextAvailableTitle') }}</span>
        <span class="notice__sub">{{ t('results.nextAvailableSub') }}</span>
      </div>
    </div>
    <!-- detail slot: steps breakdown in ListResultsView -->
    <slot name="detail" />
    <div class="list-header" :class="{ 'list-header--separated': separatedHeader }">
      <div class="list-title">
        {{ t('results.title', { n: sortedItineraries.length }, sortedItineraries.length) }}
      </div>
      <!-- toggle-button slot: viewOnList (map view) or viewOnMap (list view) -->
      <slot name="toggle-button" />
      <div class="segmented">
        <button
          type="button"
          :class="{ active: sortMode === 'rapide' }"
          @click="emit('update:sortMode', 'rapide')"
        >
          {{ t('results.sortFast') }}
        </button>
        <button
          type="button"
          :class="{ active: sortMode === 'tot' }"
          @click="emit('update:sortMode', 'tot')"
        >
          {{ t('results.sortEarly') }}
        </button>
      </div>
    </div>
    <template v-for="(group, gi) in groupedItineraries" :key="gi">
      <div v-if="group.boardingStop" class="notice notice--info notice--lg">
        <IconWalk :size="18" class="notice__icon" aria-hidden="true" />
        <div class="notice__body">
          <span class="notice__title">{{ t('results.noServiceFromStopTitle') }}</span>
          <span class="notice__sub">{{ t('results.noServiceFromStopSub', { min: group.boardingWalkMin, stop: group.boardingStop }) }}</span>
        </div>
      </div>
      <ItineraryCard
        v-for="itinerary in group.itineraries"
        :key="itinerary.legs[0].startTime ?? gi"
        :itinerary="itinerary"
        :recommended="itinerary === sortedItineraries[0]"
        :selected="itinerary === activeItinerary"
        :vertical-when-selected="verticalWhenSelected"
        :from-name="fromName"
        :to-name="toName"
        @click="emit('select', itinerary, sortedItineraries.indexOf(itinerary))"
      />
    </template>
  </template>
</template>

<style scoped>
.offline-notice {
  margin-bottom: 12px;
}

.list-header--separated {
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

.list-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.list-header .segmented {
  justify-self: end;
}

.list-title {
  font: var(--text-heading-sm);
  font-size: 15px;
  color: var(--color-text);
}

.segmented button {
  padding: 6px 12px;
}
</style>
