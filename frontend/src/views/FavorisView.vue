<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import PageHeader from '@/components/shared/PageHeader.vue'
import SettingsButton from '@/components/shared/SettingsButton.vue'
import ListRow from '@/components/shared/ListRow.vue'
import LineBadge from '@/components/shared/LineBadge.vue'
import FrequencyBadge from '@/components/shared/FrequencyBadge.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import RowActionHint from '@/components/shared/RowActionHint.vue'
import { useFavoritesStore } from '@/stores/favorites'
import { useCityStore } from '@/stores/city'
import { useFrequency } from '@/composables/useFrequency'
import { lineKey } from '@/composables/useAgencies'
import { useNavigation } from '@/composables/useNavigation'
import { buildResultsQuery } from '@/services/resultsQuery'
import { IconBusStop, IconStarFilled, IconArrowsLeftRight } from '@tabler/icons-vue'
import type { FavoriteRoute } from '@/stores/favorites'

const router = useRouter()
const favorites = useFavoritesStore()
const city = useCityStore()
const { t } = useI18n()
const { headwayMinutes, reliability } = useFrequency()
const { openStop, openLine } = useNavigation()

const favStops = computed(() =>
  favorites.favorites.filter(f => f.city === city.activeSlug),
)
const favRoutes = computed(() =>
  favorites.favoriteRoutes.filter(r => r.city === city.activeSlug),
)
const favLines = computed(() =>
  favorites.favoriteLines.filter(l => l.city === city.activeSlug),
)

function removeFavorite(id: string) {
  favorites.removeFavorite(id)
}

function goHome() {
  router.push({ name: 'home' })
}

function goLines() {
  router.push({ name: 'lines' })
}

function openRoute(fav: FavoriteRoute) {
  router.push({
    name: 'mapResults',
    // lines passed so Resultats selects the same alternative that was favorited
    query: buildResultsQuery(
      { lat: fav.fromLat, lon: fav.fromLon, name: fav.fromName },
      { lat: fav.toLat, lon: fav.toLon, name: fav.toName },
      fav.lines,
    ),
  })
}
</script>

<template>
  <div class="screen">
    <PageHeader :eyebrow="t('favoris.eyebrow')" :title="t('nav.favorites')">
      <SettingsButton />
    </PageHeader>
    <div class="screen-content sheet pattern-tile-bg">
      <div class="content-inner">
        <div class="section-title">{{ t('favoris.stopsSection') }}</div>
        <EmptyState
          v-if="favStops.length === 0"
          :title="t('favoris.emptyTitle')"
          :subtitle="t('favoris.emptySubtitle')"
          :action-label="t('favoris.emptyAction')"
          @action="goHome"
        />
        <ListRow
          v-for="fav in favStops"
          :key="fav.id"
          tag="div"
          @click="openStop(fav.id)"
        >
          <template #leading>
            <span class="row-icon row-icon--accent" aria-hidden="true"><IconBusStop :size="18" /></span>
          </template>
          <span class="fav-name">{{ fav.name }}</span>
          <span class="fav-sub">{{ t('favoris.lineCount', { n: fav.lineCount }, fav.lineCount) }}</span>
          <template #trailing>
            <RowActionHint :label="t('common.viewStop')" />
            <button
              type="button"
              class="fav-remove"
              :aria-label="t('favoris.removeFavorite')"
              @click.stop="removeFavorite(fav.id)"
            >
              <IconStarFilled :size="16" />
            </button>
          </template>
        </ListRow>

        <div class="section-title section-title-spaced">{{ t('favoris.routesSection') }}</div>
        <EmptyState
          v-if="favRoutes.length === 0"
          :title="t('favoris.emptyRoutesTitle')"
          :subtitle="t('favoris.emptyRoutesSubtitle')"
          :action-label="t('favoris.emptyAction')"
          @action="goHome"
        />
        <ListRow
          v-for="route in favRoutes"
          :key="route.id"
          tag="div"
          @click="openRoute(route)"
        >
          <template #leading>
            <span class="row-icon row-icon--accent" aria-hidden="true"><IconArrowsLeftRight :size="16" /></span>
          </template>
          <span class="route-name">{{ route.fromName }} → {{ route.toName }}</span>
          <span v-if="route.lines.length > 0" class="route-lines">
            <LineBadge v-for="line in route.lines" :key="line" :short-name="line" :size="20" />
          </span>
          <template #trailing>
            <RowActionHint :label="t('common.viewRoute')" />
            <button
              type="button"
              class="fav-remove"
              :aria-label="t('favoris.removeFavorite')"
              @click.stop="favorites.removeFavoriteRoute(route.id)"
            >
              <IconStarFilled :size="16" />
            </button>
          </template>
        </ListRow>

        <div class="section-title section-title-spaced">{{ t('favoris.linesSection') }}</div>
        <EmptyState
          v-if="favLines.length === 0"
          :icon="IconBusStop"
          :title="t('favoris.emptyLinesTitle')"
          :subtitle="t('favoris.emptyLinesSubtitle')"
          :action-label="t('favoris.emptyLinesAction')"
          @action="goLines"
        />
        <ListRow
          v-for="line in favLines"
          :key="lineKey(line.agencyId, line.shortName)"
          tag="div"
          @click="openLine(line.shortName)"
        >
          <template #leading>
            <LineBadge :short-name="line.shortName" :agency-id="line.agencyId" />
          </template>
          <span class="line-name">{{ line.longName }}</span>
          <span v-if="headwayMinutes" class="line-next">
            {{ t('common.headwayInline', { min: headwayMinutes }) }}
          </span>
          <template #trailing>
            <FrequencyBadge v-if="reliability" :reliability="reliability" />
            <RowActionHint :label="t('common.viewLine')" />
            <button
              type="button"
              class="fav-remove"
              :aria-label="t('favoris.removeFavorite')"
              @click.stop="favorites.removeFavoriteLine(line.agencyId, line.shortName, line.city)"
            >
              <IconStarFilled :size="16" />
            </button>
          </template>
        </ListRow>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Accent-filled row icon for this view's two favorite-item kinds (stop,
   itinerary) - not a shared modules.css block, single consumer. */
.row-icon--accent {
  background: var(--color-accent);
  color: var(--color-accent-text);
}

.section-title {
  font: var(--text-label-strong);
  font-weight: 800;
  color: var(--color-text);
  margin-bottom: 10px;
}

.section-title-spaced {
  margin-top: 20px;
}

.fav-name {
  font: var(--text-label-strong);
  color: var(--color-text);
}

.fav-sub {
  font: var(--text-caption-sm);
  color: var(--color-muted);
  margin-top: 2px;
}

.fav-remove {
  color: var(--color-low-dot);
  flex: none;
}

.route-name {
  font: var(--text-label-strong);
  color: var(--color-text);
}

.route-lines {
  display: flex;
  gap: 5px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.line-name {
  font: var(--text-label-strong);
  color: var(--color-text);
}

.line-next {
  font: var(--text-caption-sm);
  color: var(--color-muted);
  margin-top: 2px;
}
</style>
