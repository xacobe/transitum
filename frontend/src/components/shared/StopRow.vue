<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ListRow from './ListRow.vue'
import LineBadge from './LineBadge.vue'
import FrequencyBadge from './FrequencyBadge.vue'
import RowActionHint from './RowActionHint.vue'
import { useAgencies } from '@/composables/useAgencies'
import type { StopLine } from '@/types'

const props = defineProps<{
  line: StopLine
  // Real upcoming departure "HH:MM" times (see useUpcomingDepartures) - only
  // ever set for line.hasFixedSchedule lines. Three states matter:
  //  - undefined: not queried yet (still loading), or line.hasFixedSchedule
  //    is false - falls back to the frequency display.
  //  - [] (defined, empty): queried, no trips left today - shows a distinct
  //    "no more service today" note instead of a misleading frequency guess.
  //  - non-empty: real times, shown as-is.
  departures?: string[]
}>()
defineEmits(['select'])

const { t } = useI18n()
const { hasMultipleAgencies } = useAgencies()
</script>

<template>
  <ListRow @click="$emit('select')">
    <template #leading>
      <LineBadge :short-name="line.shortName" :agency-id="line.agencyId ?? undefined" />
    </template>
    <div class="line-name">{{ line.headsign ? `→ ${line.headsign}` : line.longName }}</div>
    <div v-if="hasMultipleAgencies" class="line-agency">{{ line.agencyName }}</div>
    <div v-if="props.departures?.length" class="meta">
      <span class="departures-text">{{ props.departures.join(' · ') }}</span>
    </div>
    <div v-else-if="line.hasFixedSchedule && props.departures !== undefined" class="meta">
      <span class="no-more-text">{{ t('stop.noMoreToday') }}</span>
    </div>
    <div v-else class="meta">
      <span v-if="line.headwayMin" class="headway-text">
        {{ t('common.headwayInline', { min: line.headwayMin }) }}
      </span>
      <FrequencyBadge v-if="line.reliability" :reliability="line.reliability" />
      <span
        v-if="!line.hasFixedSchedule"
        class="estimated-text"
        :title="t('stop.scheduleNote')"
      >
        {{ t('common.estimated') }}
      </span>
    </div>
    <template #trailing>
      <RowActionHint :label="line.hasFixedSchedule ? t('common.viewSchedule') : t('common.viewLine')" />
    </template>
  </ListRow>
</template>

<style scoped>
.line-name {
  font: var(--text-label-strong);
  color: var(--color-text);
}

.line-agency {
  font: var(--text-caption-sm);
  color: var(--color-muted);
  margin-top: 2px;
}

.meta {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 4px;
}

.headway-text {
  font: var(--text-caption-sm);
  color: var(--color-muted);
}

.departures-text {
  font: var(--text-caption-sm);
  color: var(--color-muted);
}

.estimated-text,
.no-more-text {
  font: italic var(--text-caption-sm);
  color: var(--color-muted);
}
</style>
