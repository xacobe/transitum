<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconX } from '@tabler/icons-vue'
import LineBadge from '@/components/shared/LineBadge.vue'
import { useLineStopSchedule } from '@/composables/useUpcomingDepartures'
import { useNavigation } from '@/composables/useNavigation'
import { useEscapeKey } from '@/composables/useEscapeKey'

const props = defineProps<{
  stopId: string
  shortName: string
  longName: string
  agencyId: string | null
  headsign?: string
  stopName: string
}>()
const emit = defineEmits(['close'])

const { t } = useI18n()
const { departures, loading, load } = useLineStopSchedule()
const { openLine } = useNavigation()

onMounted(() => load(props.stopId, props.shortName))

function close() {
  emit('close')
}

useEscapeKey(close)

function viewLine() {
  close()
  openLine(props.shortName, props.agencyId)
}
</script>

<template>
  <Teleport to="body">
    <div class="bottom-sheet__scrim" @click.self="close">
      <div class="bottom-sheet" role="dialog" :aria-label="t('stop.scheduleTitle', { line: shortName })">
        <div class="bottom-sheet__header">
          <div class="schedule-title">
            <LineBadge :short-name="shortName" :agency-id="agencyId ?? undefined" :size="32" />
            <div class="schedule-title-block">
              <div class="schedule-line-name">{{ longName }}</div>
              <div v-if="headsign" class="schedule-headsign">→ {{ headsign }}</div>
            </div>
          </div>
          <button type="button" class="bottom-sheet__close" :aria-label="t('common.close')" @click="close">
            <IconX :size="16" :stroke-width="2.5" />
          </button>
        </div>

        <p class="stop-name">{{ stopName }}</p>

        <p v-if="loading" class="body-text">{{ t('common.loading') }}</p>
        <p v-else-if="!departures?.length" class="body-text">{{ t('stop.noMoreToday') }}</p>
        <div v-else class="time-grid">
          <span v-for="time in departures" :key="time" class="time-chip">{{ time }}</span>
        </div>

        <div class="schedule-actions">
          <button type="button" class="btn btn--primary" @click="viewLine">
            {{ t('stop.viewLine') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.schedule-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.schedule-title-block {
  min-width: 0;
}

.schedule-line-name {
  font: var(--text-heading-sm);
  font-weight: 800;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-headsign {
  font: var(--text-caption-sm);
  color: var(--color-muted);
  margin-top: 2px;
}

.stop-name {
  font: var(--text-caption-sm);
  color: var(--color-muted);
  margin: -4px 0 var(--space-3);
}

.time-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 45vh;
  overflow-y: auto;
}

.time-chip {
  font: 700 var(--text-caption-sm);
  color: var(--color-text);
  background: var(--color-chip-bg);
  border-radius: var(--radius-full);
  padding: 6px 12px;
}

.schedule-actions {
  display: flex;
  margin-top: var(--space-3);
}

.schedule-actions .btn {
  flex: 1;
}
</style>
