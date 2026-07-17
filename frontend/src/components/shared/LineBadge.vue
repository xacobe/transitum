<script setup lang="ts">
import { computed } from 'vue'
import { useLineColor } from '@/composables/useLineColor'

const props = defineProps({
  shortName: { type: String, required: true },
  agencyId: { type: String, default: null },
  size: { type: Number, default: 36 },
})

const { colorFor } = useLineColor()
const color = computed(() => colorFor(props.shortName, props.agencyId))
</script>

<template>
  <span
    class="line-badge"
    :style="{
      minWidth: size + 'px',
      height: size + 'px',
      background: color.bg,
      color: color.text,
      fontSize: Math.round(size * 0.42) + 'px',
    }"
  >{{ shortName }}</span>
</template>

<style scoped>
.line-badge {
  display: inline-flex;
  padding-inline: .6rem;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-icon);
  font-family: var(--font-figures);
  font-weight: 700;
  flex: none;
  line-height: 1;
}
</style>
