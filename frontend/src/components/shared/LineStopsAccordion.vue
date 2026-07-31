<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouteDetail } from '@/composables/useLocalRoutes'
import { useLineColor } from '@/composables/useLineColor'
import { toMapLeg } from '@/map/geometry'
import RowActionHint from './RowActionHint.vue'
import type { MapLeg, Stop } from '@/types'

// Inline preview for a frequency-based line clicked from StopView's "Lines
// passing here" list - the same stop-sequence list as the full line view
// (just the points, no map), with the stop currently being viewed marked
// as selected in it, without navigating away. Deliberately its own lean
// component rather than reusing LineView.vue's markup directly: no
// MapStopPanel, no favorite/report buttons (already on the page this is
// embedded in).
const props = defineProps<{
  shortName: string
  agencyId: string
  // Which direction this row's StopLine entry actually matched (StopDetail
  // builds one entry per matching direction, not per route - see
  // fetchStopFromData in useRouting.ts) - picks the right direction up
  // front instead of defaulting to index 0 and possibly showing a
  // direction that doesn't even pass through currentStopId.
  headsign?: string
  currentStopId: string
}>()
const emit = defineEmits<{
  'view-stop': [id: string]
  // Fires whenever the in-place selection (see highlightedStopId below)
  // changes, full Stop object (not just an id) since StopView's own map
  // has no other list this stop is guaranteed to already be in (unlike
  // nearbyStops) to look it up from - see StopView's mapStops.
  'highlight-stop': [stop: Stop | null]
  // The currently shown direction's own line, for StopView's map to draw -
  // this component already has the full Route loaded (via useRouteDetail),
  // so StopView reuses it here instead of eagerly fetching the whole
  // city's routes.json itself just to look the same one back up.
  'active-direction': [leg: MapLeg | null]
}>()

const { t } = useI18n()
const { colorFor } = useLineColor()
const shortNameRef = computed(() => props.shortName)
const agencyIdRef = computed(() => props.agencyId)
const { route: line, loading } = useRouteDetail(shortNameRef, agencyIdRef)

// Which direction this row's StopLine entry actually matched (see
// headsign's own doc comment) - falls back to the first direction only if
// that match fails to find one, which shouldn't happen in practice.
const directionIndex = computed(() => {
  const idx = line.value?.directions.findIndex((d) => d.headsign === props.headsign) ?? -1
  return idx >= 0 ? idx : 0
})
const activeDirection = computed(() => line.value?.directions[directionIndex.value] ?? null)
const lineColor = computed(() => colorFor(props.shortName, line.value?.agencyId ?? props.agencyId))

watch(activeDirection, (dir) => {
  emit('active-direction', dir?.points?.length && line.value ? toMapLeg(line.value, dir) : null)
})

// A stop tapped in this list, other than currentStopId - marks it as
// selected in place (same highlight treatment as currentStopId) and
// reveals a "View stop" button, instead of navigating away immediately.
// Tapping the same stop again deselects it. Resets naturally whenever this
// component remounts (a different line expanded, or this one closed and
// reopened - see StopView's v-if per line), so no manual reset needed.
const highlightedStopId = ref<string | null>(null)

function toggleHighlight(id: string) {
  if (id === props.currentStopId) return
  if (highlightedStopId.value === id) {
    highlightedStopId.value = null
    emit('highlight-stop', null)
    return
  }
  highlightedStopId.value = id
  emit('highlight-stop', activeDirection.value?.stops.find((s) => s.id === id) ?? null)
}
</script>

<template>
  <div class="accordion-panel">
    <p v-if="loading" class="status-text">{{ t('common.loading') }}</p>
    <template v-else-if="line && activeDirection">
      <div class="stops-list" :style="{ '--line-color': lineColor.bg, '--line-text': lineColor.text }">
        <template v-for="(stop, i) in activeDirection.stops" :key="stop.id">
          <!-- Selected: a real <button> ("View stop") lives inside this row,
               so the row itself can't also be a <button> (invalid HTML - no
               nesting interactive controls) - a plain div with role="button"
               instead, click anywhere else in the row to deselect. -->
          <div
            v-if="stop.id === highlightedStopId"
            class="stop-row highlighted"
            :class="{ first: i === 0, last: i === activeDirection.stops.length - 1 }"
            role="button"
            tabindex="0"
            @click="toggleHighlight(stop.id)"
            @keydown.enter="toggleHighlight(stop.id)"
            @keydown.space.prevent="toggleHighlight(stop.id)"
          >
            <div class="rail">
              <span class="dot-index">{{ i + 1 }}</span>
            </div>
            <div class="stop-name">{{ stop.name }}</div>
            <button type="button" class="view-stop-btn" @click.stop="emit('view-stop', stop.id)">
              <RowActionHint :label="t('common.viewStop')" />
            </button>
          </div>
          <!-- Not selected (including currentStopId, permanently disabled):
               a plain button, nothing nested inside it. -->
          <button
            v-else
            type="button"
            class="stop-row"
            :class="{
              first: i === 0,
              last: i === activeDirection.stops.length - 1,
              current: stop.id === currentStopId,
            }"
            :disabled="stop.id === currentStopId"
            @click="toggleHighlight(stop.id)"
          >
            <div class="rail">
              <span class="dot-index">{{ i + 1 }}</span>
            </div>
            <div class="stop-name">{{ stop.name }}</div>
          </button>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
@import '@/components/shared/stopRail.css';

.accordion-panel {
  padding: 4px 0 var(--space-3);
}

.status-text {
  padding: var(--space-3) 0;
  color: var(--color-muted);
  font: var(--text-label);
}

/* .stop-row's own base look (position/rail/border-bottom/::before/etc.) is
   shared - see stopRail.css. Everything below is specific to this
   in-place toggle model, not LineView's MapStopPanel-based one.

   .current: the stop this accordion was opened from, always shown this
   way, not clickable (:disabled) - tapping the stop already being viewed
   would just navigate to itself. .highlighted: a stop tapped to preview
   (see toggleHighlight) - same treatment, but clickable (to deselect) and
   showing the "View stop" button. Same visual language as LineView's own
   .stop-row.selected either way. */
.stop-row.current,
.stop-row.highlighted {
  background: var(--color-field);
  border-radius: var(--radius-md);
}

.stop-row.current {
  cursor: default;
}

.stop-row:disabled {
  opacity: 1;
}

/* Same "fade everything but the selected stop" treatment LineView uses
   once a stop is picked on its map. */
.stop-row:not(.current):not(.highlighted) {
  opacity: .55;
}

.stop-name {
  flex: 1;
  min-width: 0;
  font: var(--text-label-strong);
  color: var(--color-text);
}

.view-stop-btn {
  flex: none;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
}
</style>
