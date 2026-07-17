<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps({
  originName: { type: String, default: '' },
  destinationName: { type: String, default: '' },
  // Carte shows it (no other "tap a stop" affordance there besides the
  // map pins themselves); Liste already has an explicit nearby-stops
  // list right above this card, so repeating the hint there would be
  // redundant.
  showHint: { type: Boolean, default: true },
})
const emit = defineEmits(['open-search-origin', 'open-search-destination'])

const { t } = useI18n()
</script>

<template>
  <div class="search-card">
    <div class="field-group">
      <button type="button" class="field-row" @click="emit('open-search-origin')">
        <span class="dot dot-accent" />
        <span class="field-text">{{ originName }}</span>
      </button>
      <div class="field-sep" />
      <button type="button" class="field-row" @click="emit('open-search-destination')">
        <span class="pin" />
        <span class="field-text" :class="{ placeholder: !destinationName }">
          {{ destinationName || t('home.destinationPlaceholder') }}
        </span>
      </button>
    </div>
    <p v-if="showHint" class="hint">
      <span class="dot dot-good" />
      <span>{{ t('home.hintStop') }}</span>
    </p>
  </div>
</template>

<style scoped>
.search-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-search);
  padding: 14px;
  box-shadow: var(--shadow-elevated);
}

.field-group {
  position: relative;
  background: var(--color-field);
  border-radius: var(--radius-card);
}

.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  width: 100%;
  text-align: left;
}

.field-sep {
  height: 1px;
  margin: 0 14px;
  background: var(--color-border-strong);
}

.field-text {
  font: var(--text-body);
  color: var(--color-field-text);
}

.field-text.placeholder {
  color: var(--color-placeholder);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: none;
}

.dot-accent {
  background: var(--color-accent);
}

.dot-good {
  width: 7px;
  height: 7px;
  background: var(--color-good-dot);
}

.pin {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-xs);
  background: var(--color-map-pin);
  flex: none;
}

.hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  width: 100%;
  text-align: left;
  font: var(--text-caption);
  color: var(--color-muted);
}
</style>
