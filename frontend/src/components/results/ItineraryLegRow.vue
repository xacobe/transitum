<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import LineBadge from '@/components/shared/LineBadge.vue'
import { useLeg } from '@/composables/useLeg'
import { useNavigation } from '@/composables/useNavigation'
import { IconWalk, IconArrowsLeftRight, IconBus } from '@tabler/icons-vue'
import type { Leg } from '@/types'

const props = defineProps<{
  leg: Leg
  isTransfer?: boolean
  // See LegChip.vue's identical prop for why this gates showing a specific
  // clock time - only ever true here since ItineraryCard only renders this
  // vertical layout for the selected card, whose fixedScheduleLines is
  // already resolved by the time it's shown.
  hasFixedSchedule?: boolean
}>()

const { duration, departureTime, agencyId, hasMultipleAgencies } = useLeg(() => props.leg)
const { openLine } = useNavigation()
const { t } = useI18n()
</script>

<template>
  <div v-if="leg.mode === 'BUS'" class="leg-row">
    <button
      type="button"
      class="badge-btn"
      :aria-label="t('common.viewLine')"
      @click.stop="openLine(leg.route?.shortName ?? '')"
    >
      <LineBadge :short-name="leg.route?.shortName ?? '?'" :agency-id="agencyId" :size="32" />
    </button>
    <div class="leg-info">
      <div v-if="leg.headsign" class="leg-headsign">→ {{ leg.headsign }}</div>
      <div v-if="hasMultipleAgencies" class="leg-agency">{{ leg.agency?.name }}</div>
    </div>
    <div class="leg-trailing">
      <span v-if="hasFixedSchedule" class="leg-time">{{ departureTime }}</span>
      <span class="ride-chip">
        <IconBus :size="13" aria-hidden="true" />
        {{ duration }}
      </span>
    </div>
  </div>
  <div v-else class="leg-row leg-row--simple">
    <span class="leg-icon" aria-hidden="true">
      <IconArrowsLeftRight v-if="isTransfer" :size="15" />
      <IconWalk v-else :size="15" />
    </span>
    <span class="leg-duration">{{ duration }}</span>
  </div>
</template>

<style scoped>
.leg-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 9px 0;
}

.leg-row:not(:last-child) {
  border-bottom: 1px solid var(--color-sep);
}

.leg-row--simple {
  color: var(--color-muted);
  padding-left: 5px;
}

.leg-icon {
  display: flex;
  flex: none;
}

.badge-btn {
  display: flex;
  flex: none;
}

.leg-duration {
  font: var(--text-caption-sm);
}

.leg-info {
  flex: 1;
  min-width: 0;
}

.leg-headsign {
  font: var(--text-label-strong);
  color: var(--color-text);
}

.leg-agency {
  font: var(--text-caption-sm);
  color: var(--color-muted);
  margin-top: 2px;
}

.leg-trailing {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex: none;
}

.leg-time {
  font: 700 var(--text-label-strong);
  color: var(--color-text);
}

.ride-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font: 600 var(--text-caption-sm);
  color: var(--color-muted);
}
</style>
