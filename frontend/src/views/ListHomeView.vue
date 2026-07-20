<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/shared/PageHeader.vue'
import SettingsButton from '@/components/shared/SettingsButton.vue'
import ListRow from '@/components/shared/ListRow.vue'
import SearchCard from '@/components/shared/SearchCard.vue'
import StopOriginModal from '@/components/list/StopOriginModal.vue'
import ModeFilterBar from '@/components/shared/ModeFilterBar.vue'
import { useNearbyStops } from '@/composables/useLocalStops'
import { useNavigation } from '@/composables/useNavigation'
import { useOriginLocation } from '@/composables/useOriginLocation'
import { useOfflineTiles } from '@/composables/useOfflineTiles'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useTransitModeFilter } from '@/composables/useTransitModeFilter'
import { useCityStore } from '@/stores/city'
import { IconBusStop, IconDownload, IconRefresh } from '@tabler/icons-vue'
import LineBadge from '@/components/shared/LineBadge.vue'
import RowActionHint from '@/components/shared/RowActionHint.vue'
import type { StopWithDistance } from '@/types'
import { formatDistance } from '@/services/format'

const LINES_MAX = 4

// Only the closest few: this is a text list (unlike Carte's map pins),
// so each extra row competes for reading space and pushes the
// origin/destination fields further down.
const NEARBY_LIST_MAX = 5

const router = useRouter()
const { t } = useI18n()
const { openStop: openStopView } = useNavigation()
const city = useCityStore()
const { isDownloaded, isUpdateAvailable } = useOfflineTiles()
const { isOnline } = useOnlineStatus()
const { availableModes, showFilter: showModeFilter, isActive: isModeActive, toggle: toggleMode } =
  useTransitModeFilter()

const showOfflineHint = computed(() =>
  isOnline.value && !isDownloaded(city.activeSlug)
)
const showUpdateHint = computed(() =>
  isOnline.value && isDownloaded(city.activeSlug) && isUpdateAvailable(city.activeSlug)
)

function goOfflineSettings() {
  router.push({ name: 'settings', state: { from: 'list' } })
}

const { stops, fetchNearby } = useNearbyStops()
const stopsLoaded = ref(false)
const selectedStop = ref<StopWithDistance | null>(null)

const { origin, setOrigin, goSearchOrigin, goSearchDestination } = useOriginLocation({
  homeRouteName: 'list',
  searchRouteName: 'listSearch',
  onOriginSet: async (lat, lon) => {
    await fetchNearby(lat, lon)
    stopsLoaded.value = true
  },
})

const originLabel = computed(() => origin.value?.name ?? t('common.myPosition'))
const nearbyStops = computed(() => stops.value.slice(0, NEARBY_LIST_MAX))

function distanceLabel(stop: StopWithDistance): string {
  return stop.distanceMeters != null ? formatDistance(stop.distanceMeters) : ''
}

function openStop(stop: StopWithDistance) {
  selectedStop.value = stop
}

function closeStopModal() {
  selectedStop.value = null
}

function useStopAsOrigin() {
  if (!selectedStop.value) return
  setOrigin(selectedStop.value.lat, selectedStop.value.lon, selectedStop.value.name)
  selectedStop.value = null
}

function goStopDetails() {
  if (!selectedStop.value) return
  openStopView(selectedStop.value.id)
}
</script>

<template>
  <div class="screen">
    <PageHeader :eyebrow="t('list.eyebrow')" :title="t('nav.list')">
      <SettingsButton />
    </PageHeader>

    <ModeFilterBar
      v-if="showModeFilter"
      :modes="availableModes"
      :is-active="isModeActive"
      @toggle="toggleMode"
    />

    <div class="body">
      <div class="screen-content sheet sheet--flex pattern-tile-bg">
        <div class="content-inner">
          <div class="nearby-section">
            <div class="section-title">{{ t('list.nearbyStops') }}</div>
            <p v-if="stopsLoaded && nearbyStops.length === 0" class="status-text">
              {{ t('list.noNearbyStops') }}
            </p>
            <ListRow v-for="stop in nearbyStops" :key="stop.id" @click="openStop(stop)">
              <template #leading>
                <span class="row-icon row-icon--field" aria-hidden="true"><IconBusStop :size="18" /></span>
              </template>
              <span class="stop-name">{{ stop.name }}</span>
              <span v-if="stop.lines?.length" class="stop-lines">
                <LineBadge
                  v-for="line in stop.lines.slice(0, LINES_MAX)"
                  :key="line"
                  :short-name="line"
                  :size="22"
                />
                <span v-if="stop.lines.length > LINES_MAX" class="stop-lines-more">
                  +{{ stop.lines.length - LINES_MAX }}
                </span>
              </span>
              <template #trailing>
                <span class="stop-trailing">
                  <span class="stop-distance">{{ distanceLabel(stop) }}</span>
                  <RowActionHint :label="t('common.viewStop')" />
                </span>
              </template>
            </ListRow>
          </div>

          <div class="spacer" />

          <button
            v-if="showOfflineHint"
            type="button"
            class="offline-hint"
            @click="goOfflineSettings"
          >
            <span class="offline-hint-icon">
              <IconDownload :size="16" aria-hidden="true" />
            </span>
            <span class="offline-hint-body">
              <span class="offline-hint-title">{{ t('list.offlineHint', { city: city.activeCity.displayName }) }}</span>
              <span class="offline-hint-sub">{{ t('list.offlineHintSub', { mb: city.activeCity.offlineMb }) }}</span>
            </span>
            <span class="offline-hint-arrow">›</span>
          </button>
          <button
            v-else-if="showUpdateHint"
            type="button"
            class="offline-hint"
            @click="goOfflineSettings"
          >
            <span class="offline-hint-icon offline-hint-icon--update">
              <IconRefresh :size="16" aria-hidden="true" />
            </span>
            <span class="offline-hint-body">
              <span class="offline-hint-title">{{ t('list.offlineUpdateHint', { city: city.activeCity.displayName }) }}</span>
              <span class="offline-hint-sub">{{ t('list.offlineUpdateHintSub') }}</span>
            </span>
            <span class="offline-hint-arrow">›</span>
          </button>

          <SearchCard
            class="bottom-fields"
            :origin-name="originLabel"
            :show-hint="false"
            @open-search-origin="goSearchOrigin"
            @open-search-destination="goSearchDestination"
          />
        </div>
      </div>

      <StopOriginModal
        v-if="selectedStop"
        :stop="selectedStop"
        @close="closeStopModal"
        @use-as-origin="useStopAsOrigin"
        @go-details="goStopDetails"
      />
    </div>
  </div>
</template>

<style scoped>
/* Only this view's .sheet needs the flex column (see .content-inner's
   comment below) - not a shared modules.css block, single consumer. */
.sheet--flex {
  display: flex;
  flex-direction: column;
}

.body {
  flex: 1;
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* This view pushes SearchCard to the bottom via the spacer inside a flex
   column (.sheet--flex on the sheet) - .content-inner needs the same
   flex behavior so that still works one level deeper. */
.content-inner {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.section-title {
  font: var(--text-caption);
  font-weight: 700;
  color: var(--color-muted);
  margin-bottom: var(--space-2);
}

.status-text {
  font: var(--text-caption);
  color: var(--color-muted);
  margin-bottom: var(--space-2);
}

.stop-name {
  font: var(--text-label-strong);
  color: var(--color-text);
}

.stop-lines {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 5px;
}

.stop-lines-more {
  font: var(--text-caption-sm);
  color: var(--color-muted);
  align-self: center;
}

.stop-trailing {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.stop-distance {
  font: var(--text-caption-sm);
  color: var(--color-muted);
}

.spacer { flex: 1; }

.offline-hint {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: var(--radius-card);
  background: var(--color-info-bg);
  border: 1px solid var(--color-info-dot);
  text-align: left;
}

.offline-hint-icon {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-icon);
  background: var(--color-info-dot);
  color: var(--color-accent-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
.offline-hint-icon--update {
  background: var(--color-good-dot);
}

.offline-hint-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.offline-hint-title {
  font: var(--text-label-strong);
  color: var(--color-info-text);
}

.offline-hint-sub {
  font: var(--text-caption-sm);
  color: var(--color-info-text);
  opacity: 0.8;
}

.offline-hint-arrow {
  flex: none;
  font-size: 18px;
  color: var(--color-info-dot);
  line-height: 1;
}

.bottom-fields {
  margin-top: 0;  /* spacer above takes all remaining space */
}
</style>
