<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import SearchResultRow from '@/components/search/SearchResultRow.vue'
import ModeFilterBar from '@/components/shared/ModeFilterBar.vue'
import { useDestinationSearchScreen } from '@/composables/useDestinationSearchScreen'
import { useTransitModeFilter } from '@/composables/useTransitModeFilter'
import { IconChevronLeft } from '@tabler/icons-vue'

const { t } = useI18n()
const route = useRoute()

const {
  results, loading, hasQuery, onInput, selectResult, goBack,
  activeField, setActiveField, liveQuery, originState, destState, originInputEl, destInputEl,
  advancedSearchOpen, toggleAdvancedSearch, selectedDate, selectedTime, dateMin, dateMax, dateNeedsConnection,
} = useDestinationSearchScreen({
  homeRouteName: route.meta.homeRouteName as string,
  resultsRouteName: route.meta.resultsRouteName as string,
})
const { availableModes, showFilter: showModeFilter, isActive: isModeActive, toggle: toggleMode } =
  useTransitModeFilter()
</script>

<template>
  <div class="screen">
    <div class="input-card-bar">
      <div class="input-card">
        <button type="button" class="back-btn" :aria-label="t('common.back')" @click="goBack">
          <IconChevronLeft :size="22" />
        </button>
        <div class="field-group">
          <div class="field-row">
            <span class="dot dot-accent" />
            <input
              ref="originInputEl"
              type="text"
              class="field-input"
              :value="activeField === 'origin' ? liveQuery : (originState?.name ?? '')"
              :placeholder="t('search.placeholderOrigin')"
              @focus="setActiveField('origin')"
              @input="onInput"
            />
          </div>
          <div class="field-sep" />
          <div class="field-row">
            <span class="pin" />
            <input
              ref="destInputEl"
              type="text"
              class="field-input"
              :value="activeField === 'destination' ? liveQuery : (destState?.name ?? '')"
              :placeholder="t('search.placeholderDestination')"
              @focus="setActiveField('destination')"
              @input="onInput"
            />
          </div>
        </div>
      </div>
      <button type="button" class="advanced-toggle" @click="toggleAdvancedSearch">
        <span>{{ t('search.advancedSearch') }}</span>
        <span class="chevron">{{ advancedSearchOpen ? '▲' : '▼' }}</span>
      </button>
      <div v-if="advancedSearchOpen" class="advanced-panel">
        <label class="form-field">
          <span class="form-field__label">{{ t('search.date') }}</span>
          <input v-model="selectedDate" type="date" class="form-field__input" :min="dateMin" :max="dateMax" />
        </label>
        <label class="form-field">
          <span class="form-field__label">{{ t('search.time') }}</span>
          <input v-model="selectedTime" type="time" class="form-field__input" />
        </label>
        <p v-if="dateNeedsConnection" class="advanced-hint">{{ t('search.needsConnection') }}</p>
      </div>
    </div>

    <ModeFilterBar
      v-if="showModeFilter"
      :modes="availableModes"
      :is-active="isModeActive"
      @toggle="toggleMode"
    />

    <div class="screen-content sheet pattern-tile-bg">
      <div class="content-inner">
        <p v-if="!hasQuery" class="status-text">{{ t('search.hint') }}</p>
        <template v-else>
          <p v-if="loading && results.length === 0" class="status-text">{{ t('search.searching') }}</p>
          <p v-else-if="results.length === 0" class="status-text">{{ t('search.noResults') }}</p>
          <SearchResultRow
            v-for="result in results"
            :key="result.id"
            :result="result"
            @select="selectResult(result)"
          />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-card-bar {
  flex: none;
  background: var(--color-nav-bg);
  border-bottom: 1px solid var(--color-nav-border);
}

.input-card {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 14px 16px;
}

.back-btn {
  color: var(--color-text);
  flex: none;
}

.field-group {
  flex: 1;
  background: var(--color-field);
  border-radius: var(--radius-card);
  transition: box-shadow .15s ease;
}

.field-group:focus-within {
  box-shadow: 0 0 0 2px var(--color-accent);
}

.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
}

.field-sep {
  height: 1px;
  margin: 0 12px;
  background: var(--color-border-strong);
}

.field-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  color: var(--color-field-text);
  border: none;
  padding: 0;
  /* 16px, not 14: iOS/Chrome zoom in on focus for any input with a
     smaller font-size (their way of making it legible) - this avoids
     that without disabling pinch-zoom for everyone via the viewport
     meta tag, which is an accessibility regression. */
  font: var(--text-input); /* 16px intentional — prevents iOS auto-zoom */
}

.field-input::placeholder {
  color: var(--color-placeholder);
}

.field-input:focus {
  outline: none;
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

.pin {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-xs);
  background: var(--color-map-pin);
  flex: none;
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
  color: var(--color-muted);
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

.advanced-hint {
  flex-basis: 100%;
  color: var(--color-accent);
  font: var(--text-caption-sm);
}
</style>
