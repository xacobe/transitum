<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import LineBadge from '@/components/shared/LineBadge.vue'
import FrequencyBadge from '@/components/shared/FrequencyBadge.vue'
import { useStopDetail } from '@/composables/useRouting'
import { useLineStopSchedule } from '@/composables/useUpcomingDepartures'
import { useFavoritesStore } from '@/stores/favorites'
import { useAgencies, lineKey } from '@/composables/useAgencies'
import { useCityStore } from '@/stores/city'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { IconX, IconBusStop, IconStar, IconStarFilled } from '@tabler/icons-vue'
import ReportButton from '@/components/shared/ReportButton.vue'

const props = defineProps<{
  stopId: string
  stopName: string
  // The line whose stop list this popup was opened from (LineView's own
  // embedded map) - shown as its own schedule block above the other lines,
  // instead of being just another badge in the scroll list.
  currentLineShortName?: string
}>()
const emit = defineEmits<{
  close: []
  'view-stop': [id: string]
  'select-line': [agencyId: string, shortName: string]
}>()

const { t } = useI18n()
const cityStore = useCityStore()
const favorites = useFavoritesStore()
const { hasMultipleAgencies } = useAgencies()

const { lines, loading, fetchStop } = useStopDetail()
const { departures: currentLineDepartures, loading: currentLineLoading, load: loadCurrentLineSchedule } =
  useLineStopSchedule()

const isFav = computed(() => favorites.isFavorite(props.stopId))

// This popup never opens another modal on top of itself (see StopRow/
// LineScheduleModal elsewhere for that richer, non-nested treatment) - the
// current line's own full schedule is shown inline, unconditionally, and
// every other line here is a plain badge that navigates away instead of
// stacking a second overlay.
const currentLine = computed(() =>
  lines.value.find((l) => l.shortName === props.currentLineShortName) ?? null,
)
// One badge per line number, not per direction - a stop can be served by
// several branches of the same line (see the "9B/15C/A/C3d" case with 2-4
// headsign variants each), and this list is just a quick "these lines are
// here too" glance, not meant to distinguish branches (tapping it navigates
// to the line's own page, which shows every direction correctly).
const otherLines = computed(() => {
  const seen = new Set<string>()
  const result: typeof lines.value = []
  for (const l of lines.value) {
    if (l.shortName === props.currentLineShortName || seen.has(l.shortName)) continue
    seen.add(l.shortName)
    result.push(l)
  }
  return result
})

function load() {
  fetchStop(props.stopId)
}

onMounted(load)
watch(() => props.stopId, load)
watch(currentLine, (line) => {
  if (line?.hasFixedSchedule) loadCurrentLineSchedule(props.stopId, line.shortName)
}, { immediate: true })

function toggleFav() {
  favorites.toggleFavorite({
    id: props.stopId,
    name: props.stopName,
    city: cityStore.activeSlug,
    lineCount: lines.value.length,
  })
}

function close() {
  emit('close')
}

useEscapeKey(close)
</script>

<template>
  <Teleport to="body">
    <div class="map-panel-wrap">
      <div class="bottom-sheet" role="dialog" :aria-label="stopName">
        <div class="bottom-sheet__header">
          <div class="stop-title">
            <span class="stop-icon" aria-hidden="true"><IconBusStop :size="20" /></span>
            <div class="bottom-sheet__title">{{ stopName }}</div>
          </div>
          <div class="header-actions">
            <button
              type="button"
              class="fav-btn"
              :class="{ saved: isFav }"
              :aria-label="t('common.favorite')"
              @click="toggleFav"
            >
              <IconStarFilled v-if="isFav" :size="16" />
              <IconStar v-else :size="16" />
            </button>
            <ReportButton
              entity-type="stop"
              :entity-id="stopId"
              :entity-name="stopName"
              :city="cityStore.activeSlug"
            />
            <button type="button" class="bottom-sheet__close" :aria-label="t('common.close')" @click="close">
              <IconX :size="16" :stroke-width="2.5" />
            </button>
          </div>
        </div>

        <div v-if="currentLine" class="current-line">
          <p v-if="currentLine.hasFixedSchedule && currentLineLoading" class="body-text">
            {{ t('common.loading') }}
          </p>
          <p v-else-if="currentLine.hasFixedSchedule && !currentLineDepartures?.length" class="body-text">
            {{ t('stop.noMoreToday') }}
          </p>
          <div v-else-if="currentLine.hasFixedSchedule" class="time-grid">
            <span v-for="time in currentLineDepartures" :key="time" class="time-chip">{{ time }}</span>
          </div>
          <div v-else class="current-line-meta">
            <span v-if="currentLine.headwayMin" class="headway-text">
              {{ t('common.headwayInline', { min: currentLine.headwayMin }) }}
            </span>
            <FrequencyBadge v-if="currentLine.reliability" :reliability="currentLine.reliability" />
            <span class="estimated-text" :title="t('stop.scheduleNote')">{{ t('common.estimated') }}</span>
          </div>
        </div>

        <div class="lines-row">
          <p v-if="loading" class="status-text">{{ t('common.loading') }}</p>
          <p v-else-if="lines.length === 0" class="status-text">{{ t('common.noLines') }}</p>
          <p v-else-if="otherLines.length === 0" class="status-text">{{ t('stopPreview.onlyThisLine') }}</p>
          <template v-else>
            <div class="lines-title">{{ t('stopPreview.otherLines') }}</div>
            <div class="lines-scroll">
              <button
                v-for="line in otherLines"
                :key="`${lineKey(line.agencyId, line.shortName)}:${line.headsign ?? ''}`"
                type="button"
                class="line-chip"
                @click="emit('select-line', line.agencyId ?? '', line.shortName)"
              >
                <LineBadge :short-name="line.shortName" :agency-id="line.agencyId ?? undefined" :size="28" />
                <span v-if="hasMultipleAgencies" class="chip-agency">{{ line.agencyName }}</span>
              </button>
            </div>
          </template>
        </div>

        <button type="button" class="btn btn--primary view-btn" @click="emit('view-stop', stopId)">
          {{ t('stopPreview.viewStop') }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Unlike the other bottom-sheet users (ReportModal, LineScheduleModal),
   this panel sits over an interactive map (LineView's embedded map,
   MiniMap in stop mode) - no scrim, and pointer-events pass through to
   the map everywhere except the sheet itself, so panning/tapping other
   stops still works while the panel is open. Closing is via the X button
   or ESC (useEscapeKey) instead of the usual click-outside. */
.map-panel-wrap {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  pointer-events: none;
}

.map-panel-wrap .bottom-sheet {
  pointer-events: auto;
}

.stop-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.stop-icon {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: var(--color-field);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}

.fav-btn {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--color-field);
  color: var(--color-low-dot);
  display: flex;
  align-items: center;
  justify-content: center;
}

.fav-btn.saved {
  background: var(--color-fav-saved-bg);
  border: 1px solid var(--color-fav-saved-border);
}

.current-line {
  margin-bottom: 12px;
}

.current-line-meta {
  display: flex;
  align-items: center;
  gap: 7px;
}

.headway-text {
  font: var(--text-caption-sm);
  color: var(--color-muted);
}

.estimated-text {
  font: italic var(--text-caption-sm);
  color: var(--color-muted);
}

.time-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
}

.time-chip {
  font: 500 12px var(--font-ui);
  color: var(--color-text);
  background: var(--color-chip-bg);
  border-radius: var(--radius-full);
  padding: 4px 10px;
}

.lines-row {
  margin-top: 12px;
}

.lines-title {
  font: var(--text-label-strong);
  font-weight: 800;
  color: var(--color-text);
  margin-bottom: 10px;
}

.status-text {
  font: 600 12px var(--font-ui);
  color: var(--color-muted);
}

.lines-scroll {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.line-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: none;
}

.chip-agency {
  font: 600 9px var(--font-ui);
  color: var(--color-muted);
}

.view-btn {
  width: 100%;
  margin-top: 14px;
}
</style>
