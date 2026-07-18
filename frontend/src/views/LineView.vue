<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MiniMap from '@/components/map/MiniMap.vue'
import MapStopPanel from '@/components/shared/MapStopPanel.vue'
import LineBadge from '@/components/shared/LineBadge.vue'
import RowActionHint from '@/components/shared/RowActionHint.vue'
import { useRouteDetail } from '@/composables/useLocalRoutes'
import { useLineColor } from '@/composables/useLineColor'
import { useAgencies } from '@/composables/useAgencies'
import { useFavoritesStore } from '@/stores/favorites'
import { track } from '@/composables/useAnalytics'
import { useCityStore } from '@/stores/city'
import { IconChevronLeft, IconStar, IconStarFilled } from '@tabler/icons-vue'
import ReportButton from '@/components/shared/ReportButton.vue'
import { useNavigation } from '@/composables/useNavigation'

const route = useRoute()
const { t } = useI18n()
const { colorFor } = useLineColor()
const { hasMultipleAgencies } = useAgencies()
const favorites = useFavoritesStore()
const city = useCityStore()

const { openStop, openLine, goBack: navGoBack } = useNavigation()
const mapSelectedStop = ref<{ id: string; name: string } | null>(null)

// Reserves exactly as much extra scroll room below the list as
// MapStopPanel is tall, so the list's true bottom lines up with the
// panel's top edge - scrolling all the way down brings the last stop up
// clear of the panel instead of stopping short (covered) or leaving
// scrollable space past where any row exists. Tracked with a
// ResizeObserver, not a one-off measurement, because the panel's own
// height changes as its content loads (e.g. the current line's schedule).
const panelHeight = ref(0)
let panelObserver: ResizeObserver | null = null

watch(mapSelectedStop, (stop) => {
  panelObserver?.disconnect()
  panelObserver = null
  if (!stop) {
    panelHeight.value = 0
    return
  }
  nextTick(() => {
    const panelEl = document.querySelector('.bottom-sheet')
    if (!panelEl) return
    panelObserver = new ResizeObserver(([entry]) => {
      panelHeight.value = entry.contentRect.height
    })
    panelObserver.observe(panelEl)
  })
})

onUnmounted(() => panelObserver?.disconnect())
const shortNameRef = computed(() => route.params.shortName as string)
const { route: line, loading } = useRouteDetail(shortNameRef)
const directionIndex = ref(0)
watch(line, () => {
  if (line.value) track('line-viewed', { line: line.value.shortName, name: line.value.longName, city: city.activeSlug })
  // A different line can have fewer directions/variants than the one just
  // left (e.g. a 6-branch line down to a plain 2-direction one) - keeping
  // a stale index would point past the end of the new array.
  directionIndex.value = 0
})
const isFav = computed(() =>
  line.value ? favorites.isFavoriteLine(line.value.agencyId, line.value.shortName, city.activeSlug) : false,
)
const activeDirection = computed(() => line.value?.directions[directionIndex.value] ?? null)
const lineColor = computed(() => colorFor(route.params.shortName as string, line.value?.agencyId ?? null))

const fromPoint = computed(() => {
  const s = activeDirection.value?.stops[0]
  return s ? ([s.lat, s.lon] as [number, number]) : undefined
})
const toPoint = computed(() => {
  const stops = activeDirection.value?.stops
  const s = stops?.[stops.length - 1]
  return s ? ([s.lat, s.lon] as [number, number]) : undefined
})
const mapRouteLegs = computed(() => {
  if (!activeDirection.value || !line.value) return []
  const extraPaths = activeDirection.value.extraPaths ?? []
  return [
    {
      mode: 'BUS' as const,
      points: activeDirection.value.points,
      routeShortName: line.value.shortName,
      routeAgencyId: line.value.agencyId,
    },
    // Minor path variants sharing this same destination (e.g. a one-off
    // diversion), dashed - so a stop only served by one of them still has
    // a visible line nearby instead of looking stranded.
    ...extraPaths.map((points) => ({
      mode: 'BUS' as const,
      points,
      routeShortName: line.value!.shortName,
      routeAgencyId: line.value!.agencyId,
      dashed: true,
    })),
  ]
})

function goBack() {
  navGoBack('lines')
}

function toggleFavorite() {
  if (!line.value) return
  favorites.toggleFavoriteLine({
    shortName: line.value.shortName,
    longName: line.value.longName,
    agencyId: line.value.agencyId,
    city: city.activeSlug,
  })
}

</script>

<template>
  <div class="screen">
    <div class="detail-header">
      <button type="button" class="detail-header__back" :aria-label="t('common.back')" @click="goBack">
        <IconChevronLeft :size="24" />
      </button>
      <LineBadge v-if="line" :short-name="line.shortName" :agency-id="line.agencyId" :size="40" />
      <div class="title-block">
        <div class="line-name">{{ line?.longName ?? '…' }}</div>
        <div v-if="line && hasMultipleAgencies" class="line-agency">{{ line.agencyName }}</div>
      </div>
      <button
        v-if="line"
        type="button"
        class="fav-btn"
        :class="{ saved: isFav }"
        :aria-label="t('common.favorite')"
        @click="toggleFavorite"
      >
        <IconStarFilled v-if="isFav" :size="20" />
        <IconStar v-else :size="20" />
      </button>
      <ReportButton
        v-if="line"
        entity-type="line"
        :entity-id="line.shortName"
        :entity-name="line.longName"
        :city="city.activeSlug"
      />
    </div>

    <div v-if="line" class="map-wrap">
      <MiniMap mode="route" :from="fromPoint" :to="toPoint" :route-legs="mapRouteLegs" :stops="activeDirection?.stops ?? []" :selected-stop-id="mapSelectedStop?.id" @stop-click="(s) => mapSelectedStop = { id: s.id ?? '', name: s.name ?? '' }" />
    </div>

    <div
      v-if="line && line.directions.length > 1"
      class="segmented segmented--inset"
      :class="{ 'segmented--many': line.directions.length > 2 }"
    >
      <button
        v-for="(dir, i) in line.directions"
        :key="i"
        type="button"
        :class="{ active: directionIndex === i }"
        @click="directionIndex = i"
      >
        {{ dir.headsign }}
      </button>
    </div>

    <div class="screen-content sheet pattern-tile-bg" :style="{ '--panel-space': panelHeight + 'px' }">
      <div class="content-inner">
        <p v-if="loading" class="status-text">{{ t('common.loading') }}</p>
        <template v-else-if="activeDirection">
          <div class="list-title">
            {{ t('line.stopsCount', { n: activeDirection.stops.length }, activeDirection.stops.length) }}
          </div>
          <div
            class="stops-list"
            :class="{ 'has-selected': mapSelectedStop }"
            :style="{ '--line-color': lineColor.bg, '--line-text': lineColor.text }"
          >
            <button
              v-for="(stop, i) in activeDirection.stops"
              :key="stop.id"
              type="button"
              class="stop-row"
              :class="{ first: i === 0, last: i === activeDirection.stops.length - 1, selected: mapSelectedStop?.id === stop.id }"
              @click="mapSelectedStop = { id: stop.id, name: stop.name }"
            >
              <div class="rail">
                <span class="dot-index">{{ i + 1 }}</span>
              </div>
              <div class="stop-content">
                <div class="stop-name">{{ stop.name }}</div>
              </div>
              <RowActionHint :label="t('common.viewStop')" />
            </button>
          </div>
        </template>
      </div>
    </div>

    <MapStopPanel
      v-if="mapSelectedStop"
      :stop-id="mapSelectedStop.id"
      :stop-name="mapSelectedStop.name"
      :current-line-short-name="line?.shortName"
      @close="mapSelectedStop = null"
      @view-stop="(id) => { mapSelectedStop = null; openStop(id) }"
      @select-line="(agencyId, shortName) => { mapSelectedStop = null; openLine(shortName) }"
    />
  </div>
</template>

<style scoped>
.fav-btn {
  flex: none;
}

.title-block {
  flex: 1;
  min-width: 0;
}

.line-name {
  font: var(--text-heading-sm);
  font-weight: 800;
  color: var(--color-text);
}

.line-agency {
  font: var(--text-caption-sm);
  color: var(--color-muted);
  margin-top: 2px;
}

.map-wrap {
  flex: none;
  height: 30%;
  margin: 0 var(--gutter) var(--space-3);
  border-radius: var(--radius-map);
  overflow: hidden;
}

/* More than 2 destination variants (a branching line, e.g. Vigo's line 7):
   equal-flex would squeeze every chip's label unreadable. Size chips to
   their own text and let the bar scroll horizontally instead. */
.segmented--many {
  overflow-x: auto;
  scrollbar-width: none;
}

.segmented--many::-webkit-scrollbar {
  display: none;
}

.segmented--many button {
  flex: none;
  white-space: nowrap;
}

.sheet {
  /* --panel-space (set from panelHeight, see the ResizeObserver above)
     extends the module's bottom padding by exactly MapStopPanel's own
     height while it's open, so the list's true scrollable end lines up
     with the panel's top edge - the last stop can scroll all the way up
     clear of it, with no dead space left over past that point. */
  padding-bottom: calc(16px + var(--panel-space, 0px));
}

.list-title {
  font: var(--text-label-strong);
  font-weight: 800;
  color: var(--color-text);
  margin-bottom: 10px;
}

.stops-list {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 0 14px;
}

.stop-row {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
  padding: 11px 0;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: opacity .15s ease, background-color .15s ease;
}

.stop-row:last-child {
  border-bottom: none;
}

/* Points at whichever stop MapStopPanel is currently open for - set from
   either this row's own click or a tap on the map marker (LineView's
   embedded map emits the same mapSelectedStop), so the two stay in sync. */
.stop-row.selected {
  background: var(--color-field);
  border-radius: var(--radius-md);
}

.stops-list.has-selected .stop-row:not(.selected) {
  opacity: .45;
}

/* The connecting line lives on .stop-row (not .rail): .rail's own content
   box is only ever as tall as the 26px dot, so top:0/bottom:0 there can
   never reach into the row's padding to meet the next row's line. Anchored
   to the row's own (padding-included) box, top:0/bottom:0 always spans
   edge-to-edge, so consecutive rows' lines touch and read as one line. */
.stop-row::before {
  content: '';
  position: absolute;
  top: -.8rem;
  bottom: 0;
  left: 11.5px;
  width: 3px;
  background: var(--line-color);
}

.rail {
  position: relative;
  width: 26px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stop-row.first::before {
  top: 24px;
}

.stop-row.last::before {
  bottom: 24px;
}

.dot-index {
  position: relative;
  z-index: 1;
  width: 26px;
  height: 26px;
  flex: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--line-color);
  color: var(--line-text);
  font: 700 12px var(--font-figures);
}

.stop-content {
  flex: 1;
  min-width: 0;
  padding-top: 3px;
}

.stop-name {
  font: var(--text-label-strong);
  color: var(--color-text);
}

</style>
