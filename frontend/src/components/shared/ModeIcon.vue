<script setup lang="ts">
import { IconBus, IconTrain, IconFerry, IconAerialLift, IconMountain } from '@tabler/icons-vue'
import { METRO_ICON_INNER_SVG, TRAM_ICON_INNER_SVG } from '@/services/modeIconSvg'
import type { TransitMode } from '@/types'

defineProps<{
  mode: TransitMode
  size?: number
}>()

// Tabler's set has no dedicated metro/tram glyph - these two get a custom
// mark (below, same stroke/viewBox conventions as Tabler's own icons) since
// they're the two modes most cities actually have alongside bus. The rest
// share the closest available Tabler icon; several (monorail, cable_tram,
// trolleybus) have no real-world data in any city yet, so a shared
// approximation is fine until one does.
const TABLER_ICON = {
  bus: IconBus,
  trolleybus: IconBus,
  rail: IconTrain,
  monorail: IconTrain,
  ferry: IconFerry,
  aerial_lift: IconAerialLift,
  cable_tram: IconAerialLift,
  funicular: IconMountain,
} as const
</script>

<template>
  <component :is="TABLER_ICON[mode as keyof typeof TABLER_ICON]" v-if="mode in TABLER_ICON" :size="size ?? 24" />
  <svg
    v-else-if="mode === 'metro'"
    :width="size ?? 24"
    :height="size ?? 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    v-html="METRO_ICON_INNER_SVG"
  />
  <svg
    v-else-if="mode === 'tram'"
    :width="size ?? 24"
    :height="size ?? 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    v-html="TRAM_ICON_INNER_SVG"
  />
</template>
