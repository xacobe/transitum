<script setup lang="ts">
import { computed } from 'vue'
import LineBadge from '@/components/shared/LineBadge.vue'
import { useAgencies, agencyIdFromGtfsId } from '@/composables/useAgencies'
import { IconWalk, IconArrowsLeftRight, IconBus, IconChevronRight } from '@tabler/icons-vue'
import { formatDuration, formatTime } from '@/services/format'
import type { Leg, BusLeg } from '@/types'

const props = defineProps<{
  leg: Leg
  isTransfer?: boolean
  // Real departure time (leg.startTime, already computed by the routing
  // engine) is only trustworthy to show as a specific clock time when this
  // leg's line has a genuine published schedule - see ItineraryCard's
  // fixedScheduleLines. Otherwise it's a RAPTOR-synthesized instant from a
  // frequencies.txt expansion, no more precise than the duration chip.
  // When true, the line chip shows the time instead of the ride duration,
  // and a second small chip (bus icon) carries the duration instead.
  hasFixedSchedule?: boolean
}>()

const { hasMultipleAgencies } = useAgencies()
const duration = computed(() => formatDuration(props.leg.duration))
const departureTime = computed(() =>
  props.leg.mode === 'BUS' ? formatTime((props.leg as BusLeg).startTime) : '',
)
const agencyId = computed(() => {
  if (props.leg.mode !== 'BUS') return undefined
  const id = agencyIdFromGtfsId((props.leg as BusLeg).agency?.gtfsId)
  return id ?? undefined
})
</script>

<template>
  <span v-if="leg.mode === 'BUS'" class="chip bus-chip">
    <LineBadge :short-name="leg.route?.shortName ?? '?'" :agency-id="agencyId" :size="28" />
    <span v-if="hasFixedSchedule" class="chip-label chip-label--time">{{ departureTime }}</span>
    <span v-else class="chip-label">{{ duration }}</span>
    <span v-if="hasMultipleAgencies" class="line-agency">{{ leg.agency?.name }}</span>
  </span>
  <span v-if="leg.mode === 'BUS' && hasFixedSchedule" class="sep-wrap">
    <IconChevronRight :size="14" aria-hidden="true" />
  </span>
  <span v-if="leg.mode === 'BUS' && hasFixedSchedule" class="chip ride-chip">
    <span class="chip-icon"><IconBus :size="16" /></span>
    <span class="chip-label">{{ duration }}</span>
  </span>
  <span v-if="leg.mode !== 'BUS' && isTransfer" class="chip transfer-chip">
    <span class="chip-icon"><IconArrowsLeftRight :size="16" /></span>
    <span class="chip-label">{{ duration }}</span>
  </span>
  <span v-if="leg.mode !== 'BUS' && !isTransfer" class="chip walk-chip">
    <span class="chip-icon"><IconWalk :size="16" /></span>
    <span class="chip-label">{{ duration }}</span>
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex: none;
}

.chip-label {
  font: 600 10px var(--font-ui);
  color: var(--color-muted);
  white-space: nowrap;
}

.chip-label--time {
  font-weight: 700;
  color: var(--color-text);
}

.walk-chip,
.transfer-chip,
.ride-chip {
  color: var(--color-muted);
}

.sep-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Matches the chip icon/badge height (28px) so the arrow centers against
     both neighbors, whatever their content stacks to. */
  height: 28px;
  color: var(--color-sep);
  flex: none;
}

.chip-icon {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--color-chip-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.line-agency {
  font: 600 9px var(--font-ui);
  color: var(--color-muted);
  max-width: 60px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
