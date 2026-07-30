<script setup lang="ts">
import { IconChevronRight } from '@tabler/icons-vue'
import type { Component } from 'vue'

withDefaults(defineProps<{ label: string; icon?: Component }>(), {
  icon: () => IconChevronRight,
})
</script>

<template>
  <span class="row-action-hint">
    {{ label }}
    <component :is="icon" :size="14" aria-hidden="true" />
  </span>
</template>

<style scoped>
.row-action-hint {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font: 600 11px var(--font-ui);
  color: var(--color-muted);
  flex: none;
  white-space: nowrap;
}
</style>
