<script setup lang="ts">
import LogoPill from '@/components/home/LogoPill.vue'

defineProps<{
  eyebrow: string
  title: string
}>()
</script>

<template>
  <div class="page-header">
    <div class="title-block">
      <div class="eyebrow">{{ eyebrow }}</div>
      <div class="title">{{ title }}</div>
    </div>
    <LogoPill class="header-logo" :pill="false" />
    <slot />
  </div>
</template>

<style scoped>
.page-header {
  flex: none;
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 18px var(--gutter) 12px;
}

.header-logo {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.title-block {
  min-width: 0;
}

.eyebrow {
  font: var(--text-eyebrow);
  letter-spacing: var(--tracking-wide);
  color: var(--color-accent);
}

.title {
  font: var(--text-page-title);
  color: var(--color-text);
  margin-top: 2px;
}
</style>
