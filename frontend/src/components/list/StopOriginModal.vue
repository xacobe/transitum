<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import StopInfoCard from '@/components/shared/StopInfoCard.vue'
import type { Stop } from '@/types'

defineProps<{ stop: Stop & { distanceMeters?: number } }>()
const emit = defineEmits(['close', 'use-as-origin', 'go-details'])

const { t } = useI18n()
</script>

<template>
  <div class="scrim" @click.self="emit('close')">
    <StopInfoCard
      class="sheet"
      :stop="stop"
      :primary-label="t('stopPreview.useAsOrigin')"
      @close="emit('close')"
      @primary="emit('use-as-origin')"
      @secondary="emit('go-details')"
    />
  </div>
</template>

<style scoped>
.scrim {
  position: absolute;
  inset: 0;
  background: var(--color-scrim);
  z-index: var(--z-raised); /* intentionally low — appears inside the map view, not full-screen */
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.sheet {
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  background-color: var(--color-surface);
  border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
  box-shadow: var(--shadow-sheet);
}
</style>
