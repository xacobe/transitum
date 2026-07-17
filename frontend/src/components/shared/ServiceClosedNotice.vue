<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useFrequency } from '@/composables/useFrequency'
import { IconMoon } from '@tabler/icons-vue'

const { t } = useI18n()
const { serviceStartLabel, serviceEndLabel } = useFrequency()
</script>

<template>
  <div class="service-closed">
    <IconMoon class="icon" :size="18" aria-hidden="true" />
    <div class="text">
      <p class="title">{{ t('serviceClosed.title') }}</p>
      <p class="sub">
        {{ t('serviceClosed.subtitle', { start: serviceStartLabel, end: serviceEndLabel }) }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.service-closed {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  text-align: left;
  padding: 12px 14px;
  margin-bottom: 14px;
  background: var(--color-chip-bg);
  border-radius: var(--radius-card);
  color: var(--color-muted);
}

.icon {
  flex: none;
}

.title {
  font: var(--text-label-strong);
  color: var(--color-text);
}

.sub {
  font: var(--text-caption-sm);
  margin-top: 2px;
}
</style>
