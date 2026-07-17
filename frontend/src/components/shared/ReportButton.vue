<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import ReportModal from '@/components/shared/ReportModal.vue'
import { IconFlag } from '@tabler/icons-vue'

withDefaults(defineProps<{
  entityType: 'stop' | 'line' | 'route' | 'general'
  entityId?: string
  entityName?: string
  city: string
}>(), {
  entityId: '',
  entityName: '',
})

const { t } = useI18n()
const open = ref(false)
</script>

<template>
  <button
    type="button"
    class="report-btn"
    :aria-label="t('report.button')"
    @click="open = true"
  >
    <IconFlag :size="16" :stroke-width="2" />
  </button>

  <ReportModal
    v-if="open"
    :entity-type="entityType"
    :entity-id="entityId"
    :entity-name="entityName"
    :city="city"
    @close="open = false"
  />
</template>

<style scoped>
.report-btn {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--color-field);
  color: var(--color-muted);
  display: flex;
  align-items: center;
  justify-content: center;
}

.report-btn:hover {
  color: var(--color-text);
}
</style>
