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

const { results, loading, placeholder, query, inputEl, hasQuery, onInput, selectResult, goBack } =
  useDestinationSearchScreen({
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
        <input
          ref="inputEl"
          v-model="query"
          type="text"
          class="search-input"
          :placeholder="placeholder"
          @input="onInput"
        />
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

.search-input {
  flex: 1;
  background: var(--color-field);
  color: var(--color-field-text);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  /* 16px, not 14: iOS/Chrome zoom in on focus for any input with a
     smaller font-size (their way of making it legible) - this avoids
     that without disabling pinch-zoom for everyone via the viewport
     meta tag, which is an accessibility regression. */
  font: var(--text-input); /* 16px intentional — prevents iOS auto-zoom */
}

.search-input::placeholder {
  color: var(--color-placeholder);
}
</style>
