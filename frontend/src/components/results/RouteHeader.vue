<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconChevronLeft, IconSwitchVertical } from '@tabler/icons-vue'

defineProps({
  fromName: { type: String, default: '' },
  toName: { type: String, default: '' },
  selectedDate: { type: String, default: '' },
  selectedTime: { type: String, default: '' },
  dateMin: { type: String, default: '' },
  dateMax: { type: String, default: '' },
  needsConnection: { type: Boolean, default: false },
})
const emit = defineEmits([
  'back', 'swap', 'edit-from', 'edit-to',
  'update:selectedDate', 'update:selectedTime', 'toggle-advanced',
])

const { t } = useI18n()
const advancedOpen = ref(false)

function toggle(): void {
  advancedOpen.value = !advancedOpen.value
  emit('toggle-advanced', advancedOpen.value)
}
</script>

<template>
  <div class="route-header">
    <div class="bar">
      <button type="button" class="back-btn" :aria-label="t('common.back')" @click="$emit('back')">
        <IconChevronLeft :size="24" />
      </button>
      <div class="field-pair">
        <button type="button" class="field-row" @click="$emit('edit-from')">{{ fromName }}</button>
        <div class="field-sep" />
        <button type="button" class="field-row" @click="$emit('edit-to')">{{ toName }}</button>
        <button
          type="button"
          class="swap-btn"
          :aria-label="t('common.swap')"
          @click="$emit('swap')"
        >
          <IconSwitchVertical :size="16" />
        </button>
      </div>
    </div>
    <button type="button" class="advanced-toggle" @click="toggle">
      <span>{{ t('search.advancedSearch') }}</span>
      <span class="chevron">{{ advancedOpen ? '▲' : '▼' }}</span>
    </button>
    <div v-if="advancedOpen" class="advanced-panel">
      <label class="advanced-field">
        <span class="advanced-field__label">{{ t('search.date') }}</span>
        <input
          :value="selectedDate"
          type="date"
          class="advanced-field__input"
          :min="dateMin"
          :max="dateMax"
          @change="emit('update:selectedDate', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <label class="advanced-field">
        <span class="advanced-field__label">{{ t('search.time') }}</span>
        <input
          :value="selectedTime"
          type="time"
          class="advanced-field__input"
          @change="emit('update:selectedTime', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <p v-if="needsConnection" class="advanced-hint">{{ t('search.needsConnection') }}</p>
    </div>
  </div>
</template>

<style scoped>
.route-header {
  flex: none;
  background: var(--color-header-bg);
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 14px 16px;
}

.back-btn {
  color: var(--color-header-text);
  flex: none;
}

.field-pair {
  flex: 1;
  position: relative;
  background: var(--color-header-field);
  border-radius: var(--radius-card);
  padding: 4px 0;
}

.field-row {
  display: block;
  width: 100%;
  padding: 8px 14px;
  font: var(--text-label);
  color: var(--color-header-text);
  text-align: left;
}

.field-sep {
  height: 1px;
  margin: 0 14px;
  background: var(--color-header-div);
}

.swap-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--color-header-text);
  display: flex;
  align-items: center;
  justify-content: center;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-1);
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 0 16px var(--space-2);
  color: var(--color-header-text);
  opacity: 0.75;
  font: var(--text-body);
}

.chevron {
  font-size: 0.7em;
}

.advanced-panel {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 0 16px var(--space-3);
}

.advanced-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.advanced-field__label {
  color: var(--color-header-text);
  opacity: 0.75;
  font: var(--text-caption-sm);
}

.advanced-field__input {
  background: var(--color-header-field);
  color: var(--color-header-text);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  font: var(--text-body);
}

.advanced-field__input:focus {
  outline: 2px solid var(--color-header-text);
  outline-offset: 1px;
}

.advanced-hint {
  flex-basis: 100%;
  color: var(--color-header-text);
  font: var(--text-caption-sm);
}
</style>
