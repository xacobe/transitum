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
    :title="shortName.length > 6 ? shortName : undefined"
    :style="{
      minWidth: size + 'px',
      maxWidth: (size * 3) + 'px',
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
  /* Most shortNames are 2-3 chars, but a feed that leaves route_short_name
     blank falls back to route_long_name (see gtfs_routes_to_json.py) - can
     be a full sentence, so this keeps the badge pill-shaped instead of
     stretching to fit it. */
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
