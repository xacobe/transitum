<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MiniMap from '@/components/map/MiniMap.vue'
import StopRow from '@/components/shared/StopRow.vue'
import ListRow from '@/components/shared/ListRow.vue'
import ServiceClosedNotice from '@/components/shared/ServiceClosedNotice.vue'
import RowActionHint from '@/components/shared/RowActionHint.vue'
import { useStopDetail } from '@/composables/useRouting'
import { useUpcomingDepartures } from '@/composables/useUpcomingDepartures'
import { useFrequency } from '@/composables/useFrequency'
import { useFavoritesStore } from '@/stores/favorites'
import { lineKey } from '@/composables/useAgencies'
import { track } from '@/composables/useAnalytics'
import { useCityStore } from '@/stores/city'
import { ref } from 'vue'
import { IconChevronLeft, IconStar, IconStarFilled, IconWifiOff, IconWalk, IconFlag } from '@tabler/icons-vue'
import ReportModal from '@/components/shared/ReportModal.vue'
import LineScheduleModal from '@/components/shared/LineScheduleModal.vue'
import { useOfflineError } from '@/composables/useOfflineError'
import type { StopLine } from '@/types'

const reportOpen = ref(false)
const scheduleFor = ref<StopLine | null>(null)
import { useNavigation } from '@/composables/useNavigation'

const route = useRoute()
const { t } = useI18n()
const { isWithinServiceHours } = useFrequency()
const { stop, lines, nearbyStops, loading, error, fetchStop } = useStopDetail()
const { departuresByLine, load: loadDepartures } = useUpcomingDepartures()
const favorites = useFavoritesStore()
const city = useCityStore()

const serviceOpen = computed(() => isWithinServiceHours())
const isOfflineError = useOfflineError(error)
const isFav = computed(() => (stop.value ? favorites.isFavorite(stop.value.id) : false))
const stopCenter = computed<[number, number] | undefined>(() =>
  stop.value ? [stop.value.lat, stop.value.lon] : undefined,
)

function load() {
  fetchStop(route.params.stopId as string)
}

onMounted(load)
watch(() => route.params.stopId, load)
watch(stop, () => {
  if (stop.value?.name) track('stop-viewed', { name: stop.value.name, city: city.activeSlug })
  if (stop.value) loadDepartures(stop.value.id, lines.value)
})
watch(loading, (isLoading) => {
  if (!isLoading && stop.value && lines.value.length === 0 && !error.value) {
    const name = stop.value.name ?? stop.value.id
    track('stop-no-lines', { name, city: city.activeSlug })
  }
})

function toggleFavorite() {
  if (!stop.value) return
  favorites.toggleFavorite({
    id: stop.value.id,
    name: stop.value.name,
    city: city.activeSlug,
    lineCount: lines.value.length,
  })
}

const stopId   = computed(() => stop.value?.id   ?? '')
const stopName = computed(() => stop.value?.name ?? '')

const { openStop, openLine, goBack: navGoBack } = useNavigation()

// Lines with a real published schedule open a modal with today's full
// timetable at this stop (see LineScheduleModal); frequency-based lines
// have no such timetable, so they still go straight to the line overview.
function selectLine(line: StopLine) {
  if (line.hasFixedSchedule) {
    scheduleFor.value = line
  } else {
    openLine(line.shortName)
  }
}

function goBack() {
  navGoBack('home')
}
</script>

<template>
  <div class="screen">
    <div class="detail-header">
      <button type="button" class="detail-header__back back-btn" :aria-label="t('common.back')" @click="goBack">
        <IconChevronLeft :size="24" />
      </button>
      <div class="detail-header__titles">
        <div class="detail-header__eyebrow">{{ t('stop.label') }}</div>
        <div class="detail-header__title">{{ stop?.name ?? '…' }}</div>
      </div>
    </div>

    <div class="map-wrap">
      <MiniMap mode="stop" :center="stopCenter" :stops="nearbyStops" @stop-click="(s) => openStop(s.id)" />
    </div>

    <div class="actions">
      <button type="button" class="action-btn" :class="{ saved: isFav }" @click="toggleFavorite">
        <IconStarFilled v-if="isFav" :size="16" aria-hidden="true" />
        <IconStar v-else :size="16" aria-hidden="true" />
        {{ isFav ? t('common.saved') : t('common.favorite') }}
      </button>
      <button type="button" class="action-btn" @click="reportOpen = true">
        <IconFlag :size="16" aria-hidden="true" />
        {{ t('report.buttonShort') }}
      </button>
    </div>

    <ReportModal
      v-if="reportOpen && stop"
      entity-type="stop"
      :entity-id="stopId"
      :entity-name="stopName"
      :city="city.activeSlug"
      @close="reportOpen = false"
    />

    <LineScheduleModal
      v-if="scheduleFor && stop"
      :stop-id="stop.id"
      :stop-name="stop.name"
      :short-name="scheduleFor.shortName"
      :long-name="scheduleFor.longName"
      :agency-id="scheduleFor.agencyId"
      :headsign="scheduleFor.headsign"
      @close="scheduleFor = null"
    />

    <div class="screen-content sheet">
      <div class="content-inner">
        <ServiceClosedNotice v-if="!serviceOpen" />
        <div class="list-header">
          <div class="list-title">{{ t('stop.linesHere') }}</div>
        </div>
        <p v-if="loading">{{ t('common.loading') }}</p>
        <p v-else-if="error && !isOfflineError">{{ t('stop.loadError') }}</p>
        <p v-else-if="!loading && lines.length === 0">{{ t('common.noLines') }}</p>
        <div v-if="isOfflineError && lines.length > 0" class="warn-notice">
          <IconWifiOff :size="13" aria-hidden="true" />
          {{ t('stop.offlineData') }}
        </div>
        <StopRow
          v-for="line in lines"
          :key="`${lineKey(line.agencyId, line.shortName)}:${line.headsign ?? ''}`"
          :line="line"
          :departures="departuresByLine[line.shortName]"
          @select="selectLine(line)"
        />

        <template v-if="nearbyStops.length > 0">
          <div class="list-header nearby-header">
            <div class="list-title">{{ t('stop.nearbyStops') }}</div>
          </div>
          <ListRow
            v-for="ns in nearbyStops"
            :key="ns.id"
            @click="openStop(ns.id)"
          >
            <template #leading>
              <span class="row-icon row-icon--field walk-icon" aria-hidden="true"><IconWalk :size="18" /></span>
            </template>
            <span class="nearby-name">{{ ns.name }}</span>
            <span class="walk-time">{{ t('stop.walkMin', { min: ns.walkMin }) }}</span>
            <template #trailing>
              <RowActionHint :label="t('common.viewStop')" />
            </template>
          </ListRow>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Top-aligned (not the module's centered default): the eyebrow + title
   stack is taller than the 24px chevron, which should hug the eyebrow. */
.detail-header {
  align-items: flex-start;
}

.back-btn {
  padding: 4px;
}

.map-wrap {
  flex: none;
  height: 50%;
  margin: 0 var(--gutter);
  border-radius: var(--radius-map);
  overflow: hidden;
}

.actions {
  flex: none;
  display: flex;
  gap: 10px;
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 14px 16px;
}

.action-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--space-3);
  border-radius: var(--radius-card);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  font: var(--text-label-strong);
}

.action-btn.saved {
  background: var(--color-fav-saved-bg);
  border-color: var(--color-fav-saved-border);
  color: var(--color-fav-saved-text);
}

/* Flush against the actions row above - no top padding on top of the
   module's default. */
.sheet {
  padding-top: 0;
}

.list-header {
  padding: 6px 0 12px;
}

.list-title {
  font: var(--text-body);
  font-weight: 800;
  color: var(--color-text);
}

.warn-notice {
  display: flex;
  align-items: center;
  gap: 5px;
  font: var(--text-caption-sm);
  color: var(--color-low-text);
  background: var(--color-low-bg);
  border-radius: var(--radius-sm);
  padding: 5px 9px;
  margin-bottom: var(--space-2);
}

.nearby-header {
  padding-top: 16px;
  margin-top: 4px;
  border-top: 1px solid var(--color-border);
}

.walk-icon {
  color: var(--color-muted);
}

.nearby-name {
  font: var(--text-label-strong);
  color: var(--color-text);
}

.walk-time {
  display: block;
  font: var(--text-caption-sm);
  color: var(--color-muted);
  white-space: nowrap;
  margin-top: 2px;
}
</style>
