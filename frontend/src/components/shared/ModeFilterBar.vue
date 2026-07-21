<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ModeIcon from '@/components/shared/ModeIcon.vue'
import type { TransitMode } from '@/types'

defineProps<{
  modes: TransitMode[]
  isActive: (mode: TransitMode) => boolean
}>()

const emit = defineEmits<{ toggle: [mode: TransitMode] }>()

const { t } = useI18n()
</script>

<template>
  <div class="mode-filter-bar" role="group">
    <button
      v-for="mode in modes"
      :key="mode"
      type="button"
      class="mode-chip"
      :class="{ active: isActive(mode) }"
      :style="{ '--chip-color': `var(--color-mode-${mode})` }"
      :aria-pressed="isActive(mode)"
      @click="emit('toggle', mode)"
    >
      <ModeIcon :mode="mode" :size="16" />
      {{ t(`modes.${mode}`) }}
    </button>
  </div>
</template>

<style scoped>
.mode-filter-bar {
  flex: none;
  display: flex;
  flex-direction: row;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.mode-filter-bar::-webkit-scrollbar { display: none; }

.mode-chip {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: var(--radius-full);
  background: var(--color-chip-bg);
  /* Icon + label tinted by mode (--chip-color, set per-chip inline - see
     styles/tokens.css's --color-mode-*) so each mode reads at a glance,
     consistent with the map's per-mode stop markers (map/stopIcon.ts). */
  color: var(--chip-color);
  font: var(--text-caption-sm);
  font-weight: 700;
  white-space: nowrap;
  transition: background var(--duration-fast), color var(--duration-fast);
}

.mode-chip :deep(svg) {
  flex: none;
}

.mode-chip.active {
  background: var(--chip-color);
  color: #fff;
}
</style>
