<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Reliability } from '@/types'

defineProps<{
  reliability: Reliability | null
}>()

const LABEL_KEYS: Record<Reliability, string> = {
  high: 'common.frequent',
  medium: 'common.infrequent',
  low: 'common.veryInfrequent',
}

const { t } = useI18n()
</script>

<template>
  <span
    v-if="reliability"
    class="frequency-badge"
    :class="reliability"
  >
    <span class="dot" aria-hidden="true" />
    {{ t(LABEL_KEYS[reliability]) }}
  </span>
  <span v-else class="frequency-badge skeleton" aria-hidden="true" />
</template>

<style scoped>
.frequency-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-full);
  font: var(--text-caption-sm);
  font-weight: 700;
  flex: none;
}

.frequency-badge.high {
  background: var(--color-good-bg);
  color: var(--color-good-text);
}

.frequency-badge.medium {
  background: var(--color-low-bg);
  color: var(--color-low-text);
}

.frequency-badge.low {
  background: var(--color-danger-bg);
  color: var(--color-danger-text);
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.high .dot {
  background: var(--color-good-dot);
}

.medium .dot {
  background: var(--color-low-dot);
}

.low .dot {
  background: var(--color-danger-dot);
}

.skeleton {
  width: 70px;
  height: 20px;
  background: var(--color-chip-bg);
}
</style>
