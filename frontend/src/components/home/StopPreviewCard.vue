<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import StopInfoCard from '@/components/shared/StopInfoCard.vue'
import type { Stop } from '@/types'

defineProps<{ stop: Stop & { distanceMeters?: number } }>()
const emit = defineEmits(['close', 'use-as-origin', 'go-details'])

const { t } = useI18n()
</script>

<template>
  <StopInfoCard
    class="preview-card"
    :stop="stop"
    :primary-label="t('stopPreview.useAsOrigin')"
    @close="emit('close')"
    @primary="emit('use-as-origin')"
    @secondary="emit('go-details')"
  />
</template>

<style scoped>
.preview-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-search);
  box-shadow: var(--shadow-elevated);
}
</style>
