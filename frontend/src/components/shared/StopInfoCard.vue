<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import StopRow from '@/components/shared/StopRow.vue'
import LineScheduleModal from '@/components/shared/LineScheduleModal.vue'
import { useStopDetail, groupStopLines } from '@/composables/useRouting'
import { useUpcomingDepartures } from '@/composables/useUpcomingDepartures'
import { useFavoritesStore } from '@/stores/favorites'
import { lineKey } from '@/composables/useAgencies'
import { useCityStore } from '@/stores/city'
import { useNavigation } from '@/composables/useNavigation'
import { IconX, IconBusStop, IconStar, IconStarFilled } from '@tabler/icons-vue'
import ReportButton from '@/components/shared/ReportButton.vue'
import type { Stop, StopLine } from '@/types'
import { formatDistance } from '@/services/format'
import { ref } from 'vue'

const { t } = useI18n()
const cityStore = useCityStore()
const { openLine } = useNavigation()

// Shared content for both StopPreviewCard.vue (Carte, floating card over
// the map) and StopOriginModal.vue (Liste, bottom-sheet modal) - same
// stop info/favorite/lines, only the outer frame and the primary action
// differ between the two.
const props = defineProps<{
  stop: Stop & { distanceMeters?: number }
  primaryLabel: string
}>()
const emit = defineEmits<{
  close: []
  primary: []
  secondary: []
}>()

const { lines, loading, fetchStop } = useStopDetail()
const { departuresByLine, load: loadDepartures } = useUpcomingDepartures()
const favorites = useFavoritesStore()
const scheduleFor = ref<StopLine | null>(null)

const isFav = computed(() => favorites.isFavorite(props.stop.id))

function load() {
  fetchStop(props.stop.id)
}

onMounted(load)
watch(() => props.stop.id, load)
watch(lines, () => {
  if (lines.value.length) loadDepartures(props.stop.id, lines.value)
})

function toggleFavorite() {
  favorites.toggleFavorite({
    id: props.stop.id,
    name: props.stop.name,
    city: cityStore.activeSlug,
    lineCount: lines.value.length,
  })
}

// Same rule as StopView's stop-detail screen: a line with a real published
// schedule opens the full-timetable modal, a frequency-based one goes
// straight to the line overview - there's no timetable to show for it.
function selectLine(line: StopLine) {
  if (line.hasFixedSchedule) {
    scheduleFor.value = line
  } else {
    openLine(line.shortName, line.agencyId)
  }
}

const distanceLabel = computed(() =>
  props.stop.distanceMeters != null ? formatDistance(props.stop.distanceMeters) : null,
)

// One row per line, not per direction - see groupStopLines's own doc
// comment for why (a stop can genuinely have more than one boardable
// direction of the same line, e.g. a dual-origin terminus).
const groupedLines = computed(() => groupStopLines(lines.value))
</script>

<template>
  <div class="stop-info-card">
    <button type="button" class="close-btn" :aria-label="t('common.close')" @click="emit('close')">
      <IconX :size="14" :stroke-width="2.5" />
    </button>

    <div class="header">
      <span class="stop-icon" aria-hidden="true"><IconBusStop :size="20" /></span>
      <div class="info">
        <div class="name">{{ stop.name }}</div>
        <div v-if="distanceLabel" class="distance">{{ t('common.walkDistance', { dist: distanceLabel }) }}</div>
      </div>
      <button
        type="button"
        class="fav-btn"
        :class="{ saved: isFav }"
        :aria-label="t('common.favorite')"
        @click="toggleFavorite"
      >
        <IconStarFilled v-if="isFav" :size="16" />
        <IconStar v-else :size="16" />
      </button>
      <ReportButton
        entity-type="stop"
        :entity-id="stop.id"
        :entity-name="stop.name"
        :city="cityStore.activeSlug"
      />
    </div>

    <div class="lines-row">
      <p v-if="loading" class="status-text">{{ t('common.loading') }}</p>
      <p v-else-if="lines.length === 0" class="status-text">{{ t('common.noLines') }}</p>
      <div v-else class="lines-list">
        <StopRow
          v-for="group in groupedLines"
          :key="`${lineKey(group.line.agencyId, group.line.shortName)}:${group.line.headsign ?? ''}`"
          :line="group.line"
          :destination-label="group.destinationLabel"
          :departures="departuresByLine[group.line.shortName]"
          @select="selectLine(group.line)"
        />
      </div>
    </div>

    <div class="actions">
      <button type="button" class="btn btn--secondary" @click="emit('secondary')">
        {{ t('stopPreview.viewStop') }}
      </button>
      <button type="button" class="btn btn--primary" @click="emit('primary')">
        {{ primaryLabel }}
      </button>
    </div>

    <LineScheduleModal
      v-if="scheduleFor"
      :stop-id="stop.id"
      :stop-name="stop.name"
      :short-name="scheduleFor.shortName"
      :long-name="scheduleFor.longName"
      :agency-id="scheduleFor.agencyId"
      :headsign="scheduleFor.headsign"
      @close="scheduleFor = null"
    />
  </div>
</template>

<style scoped>
.stop-info-card {
  position: relative;
  padding: 14px;
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--color-field);
  color: var(--color-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-right: 30px;
}

.stop-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: var(--color-field);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.info {
  flex: 1;
  min-width: 0;
}

.name {
  font: 800 14px var(--font-ui);
  color: var(--color-text);
}

.distance {
  font: 600 11px var(--font-ui);
  color: var(--color-muted);
  margin-top: 2px;
}

.fav-btn {
  flex: none;
  width: 34px;
  height: 34px;
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
  color: var(--color-low-dot);
}

.lines-row {
  margin-top: 12px;
}

.status-text {
  font: 600 12px var(--font-ui);
  color: var(--color-muted);
}

.lines-list {
  display: flex;
  flex-direction: column;
  /* Enough for ~3 rows before scrolling - this card floats over the map
     (see HomeView.vue's .bottom-overlay) and shouldn't grow tall enough to
     crowd out the search bar/map above it. */
  max-height: 240px;
  overflow-y: auto;
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

</style>
