<script setup lang="ts">
import { computed } from 'vue'
import { APP_NAME, APP_ICON } from '@/services/appConfig'

defineProps({
  // true (default): the floating pill over Carte's map — needs its own
  // background/shadow to stay legible over imagery. false: every other
  // screen's header already has its own background, so the bare mark +
  // wordmark is enough, no pill chrome competing with it.
  pill: { type: Boolean, default: true },
})

// Single icon for both themes (solid theme-color fill + white dot reads
// fine on light or dark backgrounds) - one less config axis than the old
// separate light/dark SVG files.

// Two-tone wordmark driven by VITE_APP_NAME instead of a hardcoded brand
// string, so a new deployment rebrands via config/.env alone: first word
// in the accent color, the rest (if any, e.g. "My City" in "My City Bus")
// in the regular text color. A single word renders whole in the accent
// color rather than leaving a blank second span.
const firstWord = computed(() => APP_NAME.split(' ')[0])
const restWords = computed(() => APP_NAME.split(' ').slice(1).join(' '))
</script>

<template>
  <div class="logo-pill" :class="{ 'logo-pill--bare': !pill }">
    <img :src="APP_ICON" class="logo-icon" alt="" aria-hidden="true" />
    <span class="logo-text">
      <span class="logo-accent">{{ firstWord }}</span><template v-if="restWords">{{ ' ' + restWords }}</template>
    </span>
  </div>
</template>

<style scoped>
.logo-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  background: var(--color-surface);
  border-radius: var(--radius-full);
  padding: 5px 12px 5px 5px;
  box-shadow: var(--shadow-card);
}

.logo-pill--bare {
  background: none;
  padding: 0;
  box-shadow: none;
}

.logo-icon {
  width: auto;
  height: 28px;
  flex: none;
  display: block;
}

.logo-text {
  font-weight: 800;
  font-size: 18px;
  color: var(--color-text);
}

.logo-accent {
  color: var(--color-accent);
}
</style>
