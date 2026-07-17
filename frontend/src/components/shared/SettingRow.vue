<script setup lang="ts">
defineProps({
  // 'button' for actions (cycle language, pick a city), 'a' for external
  // links (Aide & support's data sources) - plain 'div' (default) when the
  // row's own content already has its own control (ThemeToggleSwitch).
  tag: { type: String, default: 'div' },
  icon: { type: [Object, Function], required: true },
})
</script>

<template>
  <component :is="tag" class="setting-row">
    <component :is="icon" class="setting-icon" :size="18" aria-hidden="true" />
    <span class="setting-label"><slot /></span>
    <slot name="trailing" />
  </component>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 13px 14px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}

.setting-row:last-child {
  border-bottom: none;
}

.setting-icon {
  flex: none;
  color: var(--color-muted);
}

.setting-label {
  flex: 1;
  font: var(--text-label);
  color: var(--color-text);
}
</style>
