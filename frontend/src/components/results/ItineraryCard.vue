<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import LegChip from './LegChip.vue'
import ItineraryLegRow from './ItineraryLegRow.vue'
import FrequencyBadge from '@/components/shared/FrequencyBadge.vue'
import { useFrequency } from '@/composables/useFrequency'
import { busLinesOf } from '@/composables/useItinerarySearch'
import { useFavoritesStore } from '@/stores/favorites'
import { useCityStore } from '@/stores/city'
import { loadCityRoutesMeta } from '@/services/cityData'
import { IconStar, IconStarFilled, IconChevronRight } from '@tabler/icons-vue'
import { formatDuration, formatTime } from '@/services/format'
import type { Itinerary, BusLeg } from '@/types'

const props = withDefaults(
  defineProps<{
    itinerary: Itinerary
    recommended?: boolean
    selected?: boolean
    // Real name the user searched for (e.g. "Ma position", a geocoded
    // place) - the legs' from/to comes from OTP and for ad-hoc points (not
    // a stop) it only returns "Origin"/"Destination", not the real name.
    fromName?: string | null
    toName?: string | null
    // The selected card normally switches to the vertical per-leg layout
    // (real times, ride-duration chips) - ListResultsView already shows an
    // equivalent, richer step-by-step breakdown elsewhere on the page (see
    // its #detail slot), so it sets this false to keep the card itself
    // compact and avoid showing the same info twice. MapResultsView has no
    // such breakdown, so it keeps the default.
    verticalWhenSelected?: boolean
  }>(),
  { verticalWhenSelected: true },
)

const { t } = useI18n()
const favorites = useFavoritesStore()
const city = useCityStore()
const { periodAt } = useFrequency()

const formattedDuration = computed(() => formatDuration(props.itinerary.duration))

const firstLeg = computed(() => props.itinerary.legs[0])
const lastLeg = computed(() => props.itinerary.legs[props.itinerary.legs.length - 1])

// The frequency/reliability of the moment this itinerary actually runs,
// not of whenever the user happens to be looking at the screen - outside
// service hours the search already jumps to the next valid departure
// (see useItinerarySearch.ts), so "now" would often be wrong here (e.g.
// searching at 22:00 for tomorrow's first bus at 05:30).
const firstBusLeg = computed(() =>
  props.itinerary.legs.find((leg): leg is BusLeg => leg.mode === 'BUS'),
)
const activePeriod = computed(() =>
  firstBusLeg.value ? periodAt(new Date(firstBusLeg.value.startTime)) : null,
)
const headwayMinutes = computed(() =>
  activePeriod.value ? Math.round(activePeriod.value.headwaySeconds / 60) : null,
)
const reliability = computed(() => activePeriod.value?.reliability ?? null)

// Real per-leg departure times (LegChip's / ItineraryLegRow's
// :has-fixed-schedule) - every card needs this, not just the selected one,
// now that both the horizontal chip row and the vertical layout show real
// times. Cheap regardless: loadCityRoutesMeta is cached per city slug, so
// every ItineraryCard instance on screen shares one fetch. Matched by
// shortName only, not exact direction: RAPTOR's synthesized leg.headsign is
// the alighting stop's name for this leg, not the real GTFS trip headsign
// routes-meta.json carries, so it can't be cross-referenced reliably - see
// LegChip.vue's prop comment. A shortName has been uniform (all-fixed or
// all-frequency) in every city this framework has shipped so far; revisit
// with per-direction geometry matching (like minotorHelpers.js's
// getRouteShapeSegment) if a real city ever mixes both under the same line
// number.
const fixedScheduleLines = ref<Set<string>>(new Set())
loadCityRoutesMeta(city.activeSlug)
  .then((routes) => {
    fixedScheduleLines.value = new Set(
      routes.filter((r) => r.directions.some((d) => d.hasFixedSchedule)).map((r) => r.shortName),
    )
  })
  .catch(() => {
    fixedScheduleLines.value = new Set()
  })

const arrivalTime = computed(() => formatTime(lastLeg.value.endTime ?? 0))

const subtitle = computed(() => {
  const n = props.itinerary.numberOfTransfers
  if (n <= 0) return t('results.direct', { time: arrivalTime.value })
  return t('results.transfers', { n, time: arrivalTime.value }, n)
})


// An itinerary has no id of its own (see stores/favorites.ts) - it's
// recognized by origin + destination + bus lines used: origin/destination
// alone don't distinguish between the different alternatives of the same
// search.
const favFromName = computed(() => props.fromName ?? firstLeg.value.from.name)
const favToName = computed(() => props.toName ?? lastLeg.value.to.name)
// Same line-sequence identity used everywhere else an itinerary is keyed
// (favoriting, preselecting a favorited alternative) - see useItinerarySearch.
const favLines = computed<string[]>(() => busLinesOf(props.itinerary))

// When the origin was the user's GPS position, replace the live "My location"
// label with a fixed friendly name so the saved itinerary doesn't imply it
// will re-route from wherever the user happens to be in the future.
const resolvedFromName = computed(() =>
  favFromName.value === t('common.myPosition')
    ? t('common.savedPosition')
    : favFromName.value,
)

const isFavorited = computed(() =>
  favorites.isFavoriteRoute(resolvedFromName.value, favToName.value, favLines.value, city.activeSlug),
)

function toggleFavorite() {
  favorites.toggleFavoriteRoute({
    fromName: resolvedFromName.value,
    fromLat: firstLeg.value.from.lat ?? 0,
    fromLon: firstLeg.value.from.lon ?? 0,
    toName: favToName.value,
    toLat: lastLeg.value.to.lat ?? 0,
    toLon: lastLeg.value.to.lon ?? 0,
    lines: favLines.value,
    city: city.activeSlug,
  })
}
</script>

<template>
  <div class="itinerary-card" :class="{ selected }">
    <span v-if="recommended" class="ribbon">{{ t('results.recommended') }}</span>
    <div class="top-row">
      <div>
        <div class="duration">
          ~{{ formattedDuration }}
        </div>
        <div class="subtitle">{{ subtitle }}</div>
      </div>
      <div class="top-row-actions">
        <button
          type="button"
          class="fav-btn"
          :class="{ saved: isFavorited }"
          :aria-label="t('common.favorite')"
          @click.stop="toggleFavorite"
        >
          <IconStarFilled v-if="isFavorited" :size="16" />
          <IconStar v-else :size="16" />
        </button>
        <FrequencyBadge v-if="reliability" :reliability="reliability" />
      </div>
    </div>

    <div v-if="selected && verticalWhenSelected" class="legs-list">
      <ItineraryLegRow
        v-for="(leg, i) in itinerary.legs"
        :key="i"
        :leg="leg"
        :is-transfer="leg.mode === 'WALK' && i > 0 && i < itinerary.legs.length - 1"
        :has-fixed-schedule="leg.mode === 'BUS' && fixedScheduleLines.has(leg.route.shortName)"
      />
    </div>
    <div v-else class="legs-row">
      <template v-for="(leg, i) in itinerary.legs" :key="i">
        <LegChip
          :leg="leg"
          :is-transfer="leg.mode === 'WALK' && i > 0 && i < itinerary.legs.length - 1"
          :has-fixed-schedule="leg.mode === 'BUS' && fixedScheduleLines.has(leg.route.shortName)"
        />
        <span v-if="i < itinerary.legs.length - 1" class="sep-wrap">
          <IconChevronRight :size="14" aria-hidden="true" />
        </span>
      </template>
    </div>

  </div>
</template>

<style scoped>
.itinerary-card {
  position: relative;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-map);
  padding: 14px 15px 15px;
  margin-bottom: 11px;
  box-shadow: var(--shadow-card);
  cursor: pointer;
}

.itinerary-card.selected {
  border-color: var(--color-accent);
  border-width: 2px;
  padding: 13px 14px 14px;
}

.ribbon {
  position: absolute;
  top: 0;
  right: 16px;
  background: var(--color-ribbon-bg);
  color: var(--color-ribbon-text);
  font: 800 9px var(--font-ui);
  letter-spacing: .04em;
  padding: 3px 9px;
  border-radius: 0 0 var(--radius-sm) var(--radius-sm);
}

.top-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.top-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: none;
}

.fav-btn {
  display: flex;
  color: var(--color-low-dot);
}

.fav-btn.saved {
  color: var(--color-low-dot);
}

.duration {
  font: 700 20px var(--font-figures);
  color: var(--color-text);
  line-height: 1;
}

.subtitle {
  font: 600 12px var(--font-ui);
  color: var(--color-muted);
  margin-top: 5px;
}

.legs-row {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.legs-list {
  display: flex;
  flex-direction: column;
  margin-top: 8px;
}

.sep-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  /* Matches LegChip's LineBadge/chip-icon height (28px) so the arrow centers
     against them even though .legs-row uses align-items: flex-start (needed
     for chips whose content stacks taller, e.g. a real departure time under
     a headsign) - centering the icon's own size would just make it bigger. */
  height: 28px;
  color: var(--color-sep);
  flex: none;
}

</style>
