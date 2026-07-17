<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useReports } from '@/composables/useReports'
import { useEscapeKey } from '@/composables/useEscapeKey'
import { IconX } from '@tabler/icons-vue'

const props = defineProps<{
  entityType: 'stop' | 'line' | 'route' | 'general'
  entityId?: string
  entityName?: string
  city: string
}>()
const emit = defineEmits(['close'])

const { t } = useI18n()
const { submitting, submitted, error, submitReport, reset } = useReports()

const category    = ref('')
const description = ref('')
const email       = ref('')

const titleKey = computed(() => {
  if (props.entityType === 'stop') return 'report.titleStop'
  if (props.entityType === 'line') return 'report.titleLine'
  return 'report.title'
})

const categories = computed(() => [
  { value: 'wrong_stop',      label: t('report.categoryWrongStop') },
  { value: 'route_changed',   label: t('report.categoryRouteChanged') },
  { value: 'wrong_schedule',  label: t('report.categoryWrongSchedule') },
  { value: 'other',           label: t('report.categoryOther') },
])

async function onSubmit() {
  if (!category.value) return
  await submitReport({
    city:        props.city,
    entity_type: props.entityType,
    entity_id:   props.entityId ?? '',
    entity_name: props.entityName ?? '',
    category:    category.value as 'wrong_stop' | 'route_changed' | 'wrong_schedule' | 'other',
    description: description.value.trim(),
    contact_email: email.value.trim(),
  })
}

// Close automatically 2.5s after successful submit. The handle is tracked
// so the timer can't fire after the modal is unmounted by other means.
let closeTimer: ReturnType<typeof setTimeout> | null = null
watch(submitted, val => {
  if (val) closeTimer = setTimeout(() => emit('close'), 2500)
})
onUnmounted(() => {
  if (closeTimer !== null) clearTimeout(closeTimer)
})

function close() {
  reset()
  emit('close')
}

useEscapeKey(close)
</script>

<template>
  <Teleport to="body">
    <div class="bottom-sheet__scrim" @click.self="close">
      <div class="bottom-sheet" role="dialog" :aria-label="t(titleKey)">
        <div class="bottom-sheet__header">
          <div class="bottom-sheet__title">{{ t(titleKey) }}</div>
          <button type="button" class="bottom-sheet__close" :aria-label="t('common.close')" @click="close">
            <IconX :size="16" :stroke-width="2.5" />
          </button>
        </div>

        <!-- Success state -->
        <div v-if="submitted" class="success-state">
          <p class="success-text">{{ t('report.success') }}</p>
        </div>

        <!-- Form -->
        <form v-else class="report-form" @submit.prevent="onSubmit">
          <div class="form-field">
            <label class="form-field__label">{{ t('report.categoryLabel') }}</label>
            <select v-model="category" class="form-field__input" required>
              <option value="" disabled>{{ t('report.categoryPlaceholder') }}</option>
              <option v-for="cat in categories" :key="cat.value" :value="cat.value">
                {{ cat.label }}
              </option>
            </select>
          </div>

          <div class="form-field">
            <label class="form-field__label">{{ t('report.descriptionLabel') }}</label>
            <textarea
              v-model="description"
              class="form-field__input form-field__input--textarea"
              :placeholder="t('report.descriptionPlaceholder')"
              maxlength="500"
              rows="3"
            />
          </div>

          <div class="form-field">
            <label class="form-field__label">{{ t('report.emailLabel') }}</label>
            <input
              v-model="email"
              type="email"
              class="form-field__input"
              :placeholder="t('report.emailPlaceholder')"
            />
          </div>

          <p v-if="error" class="report-error">{{ t('report.error') }}</p>

          <div class="report-actions">
            <button type="button" class="btn btn--secondary" @click="close">
              {{ t('report.cancel') }}
            </button>
            <button
              type="submit"
              class="btn btn--primary"
              :disabled="!category || submitting"
            >
              {{ submitting ? t('report.submitting') : t('report.submit') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.report-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.report-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-1);
}

.report-error {
  font: var(--text-caption);
  color: var(--color-low-text);
}

.success-state {
  padding: 24px 0 8px;
  text-align: center;
}

.success-text {
  font: var(--text-body);
  color: var(--color-text);
}
</style>
