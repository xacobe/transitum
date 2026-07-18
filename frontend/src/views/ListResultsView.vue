<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import LineBadge from '@/components/shared/LineBadge.vue'
import RouteHeader from '@/components/results/RouteHeader.vue'
import ItineraryResultsList from '@/components/results/ItineraryResultsList.vue'
import { useItinerarySearch, busLinesOf } from '@/composables/useItinerarySearch'
import { agencyIdFromGtfsId } from '@/composables/useAgencies'
import { IconWalk, IconBus, IconMapPin, IconMap, type Icon } from '@tabler/icons-vue'
import { formatDuration, formatTime } from '@/services/format'
import { useOfflineError } from '@/composables/useOfflineError'
import { buildResultsQuery } from '@/services/resultsQuery'

type StepIcon = 'walk' | 'board' | 'alight'
const STEP_ICONS: Record<StepIcon, Icon> = { walk: IconWalk, board: IconBus, alight: IconMapPin }

const router = useRouter()
const { t } = useI18n()

const {
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
  sortedItineraries,
  activeItinerary,
  goBack,
  swapOriginDestination,
  goEditOrigin,
  goEditDestination,
} = useItinerarySearch({ backRouteName: 'list', selfRouteName: 'listResults', searchRouteName: 'listSearch' })

const isOfflineError = useOfflineError(error)

const formattedDuration = computed(() =>
  activeItinerary.value ? formatDuration(activeItinerary.value.duration) : null,
)

const arrivalTime = computed(() => {
  if (!activeItinerary.value) return null
  const legs = activeItinerary.value.legs
  return formatTime(legs[legs.length - 1].endTime ?? 0)
})

// Each leg becomes 1 step (on foot) or 2 (board and alight the bus).
// Works for both online (OTP) and offline (Minotor) itineraries since both
// produce the same legs shape via buildSyntheticItinerary.
const steps = computed(() => {
  if (!activeItinerary.value) return []
  const legs = activeItinerary.value.legs
  const out: { icon: StepIcon; badge: string | null; badgeAgencyId?: string | null; text: string }[] = []
  legs.forEach((leg, i) => {
    const isLast = i === legs.length - 1
    const min = Math.max(1, Math.round(leg.duration / 60))
    if (leg.mode === 'WALK') {
      out.push({
        icon: 'walk',
        badge: null,
        text: isLast
          ? t('list.walkStep', { min })
          : t('list.walkToStep', { min, place: leg.to.name }),
      })
    } else {
      out.push({
        icon: 'board',
        badge: leg.route?.shortName ?? null,
        badgeAgencyId: agencyIdFromGtfsId(leg.agency?.gtfsId),
        text: t('list.boardStep', {
          route: leg.route?.shortName ?? '?',
          headsign: leg.headsign ?? leg.to.name,
        }),
      })
      out.push({ icon: 'alight', badge: null, text: t('list.alightStep', { place: leg.to.name }) })
    }
  })
  return out
})

function viewOnMap() {
  router.push({
    name: 'mapResults',
    query: buildResultsQuery(
      { lat: fromLat.value, lon: fromLon.value, name: fromName.value },
      { lat: toLat.value, lon: toLon.value, name: toName.value },
      activeItinerary.value ? busLinesOf(activeItinerary.value) : undefined,
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
    <div class="screen-content sheet pattern-tile-bg">
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
          :separated-header="true"
          :vertical-when-selected="false"
          @update:sort-mode="sortMode = $event"
          @select="selectedItinerary = $event"
        >
          <template #toggle-button>
            <button type="button" class="view-toggle-btn" @click="viewOnMap">
              <IconMap :size="14" aria-hidden="true" />
              {{ t('list.viewOnMap') }}
            </button>
          </template>
          <template #detail>
            <div class="summary">{{ t('list.summary', { duration: formattedDuration, time: arrivalTime }) }}</div>
            <ol class="steps">
              <li v-for="(step, i) in steps" :key="i" class="step">
                <component :is="STEP_ICONS[step.icon]" class="step-icon" :size="16" aria-hidden="true" />
                <span class="step-text">
                  <LineBadge v-if="step.badge" :short-name="step.badge" :agency-id="step.badgeAgencyId ?? undefined" :size="22" />
                  {{ step.text }}
                </span>
              </li>
            </ol>
          </template>
        </ItineraryResultsList>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary {
  font: var(--text-heading-sm);
  color: var(--color-text);
  margin-bottom: 14px;
}

.steps {
  list-style: none;
  counter-reset: step;
  margin-bottom: 14px;
}

.step {
  counter-increment: step;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-3);
  margin-bottom: var(--space-2);
}

.step::before {
  content: counter(step);
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-chip-bg);
  color: var(--color-chip-text);
  font: 700 11px var(--font-figures);
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-icon {
  flex: none;
}

.step-text {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font: var(--text-label);
  color: var(--color-text);
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
