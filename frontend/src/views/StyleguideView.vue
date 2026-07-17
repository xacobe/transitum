<script setup lang="ts">
import { ref } from 'vue'
import ColorSwatch from '@/components/styleguide/ColorSwatch.vue'
import LineBadge from '@/components/shared/LineBadge.vue'
import FrequencyBadge from '@/components/shared/FrequencyBadge.vue'
import ListRow from '@/components/shared/ListRow.vue'
import SettingRow from '@/components/shared/SettingRow.vue'
import EmptyState from '@/components/shared/EmptyState.vue'
import ServiceClosedNotice from '@/components/shared/ServiceClosedNotice.vue'
import ThemeToggleSwitch from '@/components/shared/ThemeToggleSwitch.vue'
import SettingsButton from '@/components/shared/SettingsButton.vue'
import SearchCard from '@/components/shared/SearchCard.vue'
import SearchResultRow from '@/components/search/SearchResultRow.vue'
import RouteHeader from '@/components/results/RouteHeader.vue'
import LogoPill from '@/components/home/LogoPill.vue'
import { APP_ICON, APP_NAME } from '@/services/appConfig'
import StopRow from '@/components/shared/StopRow.vue'
import LegChip from '@/components/results/LegChip.vue'
import ItineraryCard from '@/components/results/ItineraryCard.vue'
import StopInfoCard from '@/components/shared/StopInfoCard.vue'
import BottomNav from '@/components/layout/BottomNav.vue'
import type { Leg, Itinerary, SearchResult, Stop, StopLine } from '@/types'
import {
  IconArrowsLeftRight,
  IconBuildingCommunity,
  IconBuildingHospital,
  IconBuildingStore,
  IconBus,
  IconBusStop,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconCurrentLocation,
  IconDownload,
  IconExternalLink,
  IconHelpCircle,
  IconList,
  IconMap,
  IconMapPin,
  IconMoon,
  IconSchool,
  IconSettings,
  IconStar,
  IconStarFilled,
  IconSun,
  IconSwitchVertical,
  IconWalk,
  IconWorld,
  IconX,
} from '@tabler/icons-vue'

// Tokens shown as plain data, not re-derived from anything live: this
// page is a catalog, the actual CSS values still live in tokens.css and
// the components imported above.

const colorGroups = [
  {
    title: 'Base & surfaces',
    items: [
      ['--color-backdrop', 'Background behind the app'],
      ['--color-app-bg', 'Screen background (.screen)'],
      ['--color-sheet-bg', 'Sheet background (.sheet)'],
      ['--color-surface', 'Cards, rows'],
      ['--color-field', 'Inputs/fields, icon circles'],
      ['--color-border', 'Subtle border'],
      ['--color-border-strong', 'Strong border, separators'],
      ['--color-sep', 'Separator / chevron'],
    ],
  },
  {
    title: 'Text',
    items: [
      ['--color-text', 'Primary text'],
      ['--color-muted', 'Secondary text'],
      ['--color-sub', 'Tertiary text (units, small labels)'],
      ['--color-placeholder', 'Field placeholder'],
      ['--color-field-text', 'Text inside fields'],
    ],
  },
  {
    title: 'Accent & brand',
    items: [
      ['--color-accent', 'Primary action, brand'],
      ['--color-accent-text', 'Text on accent'],
      ['--color-brand-dot', 'Logo dot'],
    ],
  },
  {
    title: 'States (frequency, favorites)',
    items: [
      ['--color-good-bg', '"Fréquent" background'],
      ['--color-good-text', '"Fréquent" text'],
      ['--color-good-dot', '"Fréquent" dot / good time'],
      ['--color-low-bg', '"Peu fréquent" background'],
      ['--color-low-text', '"Peu fréquent" text'],
      ['--color-low-dot', '"Peu fréquent" dot'],
      ['--color-danger-bg', '"Très peu fréquent" background'],
      ['--color-danger-text', '"Très peu fréquent" text'],
      ['--color-danger-dot', '"Très peu fréquent" dot'],
      ['--color-time-good', 'Arrival time, normal case'],
      ['--color-time-low', 'Arrival time, transfer wait'],
      ['--color-fav-saved-bg', 'Saved ★ background'],
      ['--color-fav-saved-border', 'Saved ★ border'],
      ['--color-fav-saved-text', 'Saved ★ / gold icon'],
    ],
  },
  {
    title: 'Chips & ribbon',
    items: [
      ['--color-chip-bg', 'Chip/segmented background'],
      ['--color-chip-text', 'Chip/segmented text'],
      ['--color-ribbon-bg', '"Recommandé" ribbon'],
      ['--color-ribbon-text', 'Ribbon text'],
    ],
  },
  {
    title: 'Map',
    items: [
      ['--color-map-bg', 'MiniMap background'],
      ['--color-map-road', 'Streets'],
      ['--color-map-route', 'Route line (no agencyId)'],
      ['--color-map-pin', 'Destination pin'],
    ],
  },
  {
    title: 'Header (RouteHeader)',
    items: [
      ['--color-header-bg', 'Header background'],
      ['--color-header-text', 'Header text'],
      ['--color-header-field', 'Origin/destination field'],
      ['--color-header-div', 'Internal separator'],
    ],
  },
  {
    title: 'Bottom navigation',
    items: [
      ['--color-nav-bg', 'BottomNav background'],
      ['--color-nav-border', 'Top border'],
      ['--color-nav-inactive', 'Inactive icon/label'],
      ['--color-nav-active', 'Active icon/label'],
    ],
  },
]

const typographySamples = [
  { sample: 'Mon App', style: 'font: 800 24px var(--font-ui)', desc: 'Screen title (.title)' },
  { sample: 'ITINÉRAIRES', style: "font: 700 9px var(--font-ui); letter-spacing: .1em", desc: 'Eyebrow (.eyebrow)' },
  { sample: 'Lignes qui passent ici', style: 'font: 800 13px var(--font-ui)', desc: 'Section title (.list-title / .section-title)' },
  { sample: "Les horaires ne sont pas exacts : l'opérateur ne publie pas de grille horaire détaillée.", style: 'font: 600 13px/1.55 var(--font-ui); color: var(--color-muted)', desc: 'Body text (.body-text) — help, descriptions' },
  { sample: 'Prends le 5b vers UTS', style: 'font: 600 13px var(--font-ui)', desc: 'UI label (.step-text, .line-name)' },
  { sample: 'Arrêts à proximité', style: 'font: 600 11px var(--font-ui)', desc: 'Secondary text (.headway-text, .sub)' },
  { sample: '~22', style: 'font: 700 22px var(--font-figures)', desc: 'Large figure (.duration, ItineraryCard)' },
  { sample: '08:42', style: 'font: 700 12px var(--font-figures)', desc: 'Small figure (LineBadge, .dot-index)' },
]

// Sample data for components that take props/objects as input - not
// needed for components that already fetch their own real data
// (StopInfoCard below uses a real stop, fetched live - not faked, see
// realStop's own comment further down for the caveat that implies).

const now = Date.now()
const MIN = 60_000
const sampleItinerary = {
  duration: 22 * 60,
  waitingTime: 4 * 60,
  numberOfTransfers: 1,
  legs: [
    {
      mode: 'WALK' as const,
      startTime: now,
      endTime: now + 5 * MIN,
      duration: 5 * 60,
      distance: 350,
      headsign: null,
      from: { name: 'Ma position', lat: 12.3718, lon: -1.5269 },
      to: { name: 'Arrêt University', lat: 12.3714, lon: -1.5197 },
      route: null,
      agency: null,
      legGeometry: { points: '', length: 0 },
    },
    {
      mode: 'BUS' as const,
      startTime: now + 5 * MIN,
      endTime: now + 13 * MIN,
      duration: 8 * 60,
      distance: 3100,
      headsign: 'East District',
      from: { name: 'Arrêt University', lat: 12.3714, lon: -1.5197 },
      to: { name: 'Arrêt Central Square', lat: 12.365, lon: -1.51 },
      route: { shortName: '5b' },
      agency: { gtfsId: 'example-city:AGENCY', name: 'Transit Agency' },
      legGeometry: { points: '', length: 0 },
    },
    {
      mode: 'BUS' as const,
      startTime: now + 17 * MIN,
      endTime: now + 22 * MIN,
      duration: 5 * 60,
      distance: 2000,
      headsign: 'Terminus',
      from: { name: 'Arrêt Central Square', lat: 12.365, lon: -1.51 },
      to: { name: 'Arrêt East District', lat: 12.36, lon: -1.49 },
      route: { shortName: '12' },
      agency: { gtfsId: 'example-city:AGENCY', name: 'Transit Agency' },
      legGeometry: { points: '', length: 0 },
    },
  ],
} as unknown as Itinerary

const sampleStopRows: StopLine[] = [
  { shortName: '5b', longName: 'North Side - University', agencyId: 'AGENCY', agencyName: 'Transit Agency', headwayMin: 20, reliability: 'high', hasFixedSchedule: true },
  { shortName: '12', longName: 'Terminus - East District', agencyId: 'AGENCY', agencyName: 'Transit Agency', headwayMin: 30, reliability: 'medium', hasFixedSchedule: true },
  { shortName: 'UNI 1', longName: 'University - East District', agencyId: 'AGENCY', agencyName: 'Transit Agency', headwayMin: 45, reliability: 'low', hasFixedSchedule: false },
]

const sampleSearchResults: SearchResult[] = [
  { id: 's1', name: 'Arrêt University', sub: 'Arrêt de bus', icon: 'stop', source: 'stop', lat: 12.3714, lon: -1.5197 },
  { id: 's2', name: "Hôpital Central", sub: 'Hôpital', icon: 'hospital', source: 'poi', lat: 12.37, lon: -1.53 },
  { id: 's3', name: 'Grand Marché', sub: 'Marché', icon: 'marketplace', source: 'poi', lat: 12.36, lon: -1.52 },
  { id: 's4', name: 'University', sub: 'Université', icon: 'university', source: 'poi', lat: 12.38, lon: -1.51 },
  { id: 's5', name: 'East District', sub: 'Quartier', icon: 'neighbourhood', source: 'place', lat: 12.35, lon: -1.49 },
  { id: 's6', name: 'Example Country', sub: '', icon: 'place', source: 'place', lat: 12.37, lon: -1.52 },
]

const sampleLegWalk = { mode: 'WALK', duration: 240 } as unknown as Leg
const sampleLegBus = {
  mode: 'BUS',
  duration: 480,
  route: { shortName: '5b' },
  agency: { gtfsId: 'example-city:AGENCY', name: 'Transit Agency' },
} as unknown as Leg

// Deliberately not faked, so this card hits useStopDetail()/OTP exactly
// like it does in the app - but that means it only actually resolves when
// a city with this stop ID is configured (see config/cities.json). Swap
// for a real stop ID from whatever example/city you have installed
// (`make use-example NAME=...`) to see this card populated; it degrades
// to an empty/error state otherwise, which is itself a fine thing to see
// on this page.
const realStop: Stop & { distanceMeters?: number } = { id: 'example-city:OSM0000000000', name: 'Example Stop', lat: 12.3714, lon: -1.5197 }

const favSaved = ref(false)
const segmentedActive = ref('rapide')
</script>

<template>
  <div class="screen styleguide">
    <div class="header">
      <div class="title-block">
        <div class="eyebrow">{{ APP_NAME }}</div>
        <div class="title">Design system</div>
      </div>
      <div class="theme-demo">
        <span>Theme</span>
        <ThemeToggleSwitch />
      </div>
    </div>

    <div class="screen-content sheet">
      <p class="body-text intro">
        Living catalog: every sample below uses the app's real components and tokens
        (<code>tokens.css</code> + <code>frontend/src/components/</code>), not a separate copy.
        Toggle the theme switch top-right to see everything respond at once.
        This route isn't linked from the nav, only reachable by URL.
      </p>

      <!-- COLORS -->
      <h2 class="h2">Colors</h2>
      <div v-for="group in colorGroups" :key="group.title" class="group">
        <h3 class="h3">{{ group.title }}</h3>
        <div class="row wrap">
          <ColorSwatch v-for="[v, l] in group.items" :key="v" :var-name="v" :label="l" />
        </div>
      </div>

      <h3 class="h3">Line color palette (<code>useLineColor.js</code> hash)</h3>
      <p class="note">
        12 color pairs, assigned by hashing <code>shortName</code>
        (or <code>agencyId::shortName</code> once a city has more than one agency).
        Lines "1".."12" below only show the spread, they aren't real lines.
      </p>
      <div class="row wrap">
        <LineBadge v-for="n in 12" :key="n" :short-name="String(n)" :size="40" />
      </div>

      <!-- TYPOGRAPHY -->
      <h2 class="h2">Typography</h2>
      <p class="note">
        Two families: <code>--font-ui</code> (Plus Jakarta Sans, all text) and
        <code>--font-figures</code> (Space Grotesk, figures only: times, line badges, counters).
      </p>
      <div class="type-list">
        <div v-for="t in typographySamples" :key="t.desc" class="type-row">
          <div class="type-sample" :style="t.style">{{ t.sample }}</div>
          <div class="type-desc">
            <div>{{ t.desc }}</div>
            <code>{{ t.style }}</code>
          </div>
        </div>
      </div>

      <!-- SHADOWS -->
      <h2 class="h2">Shadows</h2>
      <div class="row wrap">
        <div class="shadow-demo">
          <div class="shadow-box" style="box-shadow: var(--shadow-card)" />
          <code>--shadow-card</code>
          <div class="note">LogoPill, ItineraryCard, Home cards</div>
        </div>
        <div class="shadow-demo">
          <div class="shadow-box" style="box-shadow: var(--shadow-phone)" />
          <code>--shadow-phone</code>
          <div class="note">Defined in tokens.css, not currently used in the code</div>
        </div>
      </div>

      <!-- PATTERNS -->
      <h2 class="h2">Background pattern</h2>
      <p class="note">
        <code>.pattern-tile-bg</code> (base.css) - webp with a png fallback via <code>image-set()</code>.
        Used on Lignes, Favoris, Ligne (detail) and Aide; deliberately not on Carte/Home (the map
        is already the background) nor on Vue d'arrêt/Résultats/Réglages (explicit decision, see README).
      </p>
      <div class="pattern-demo pattern-tile-bg" />

      <!-- ICONOGRAPHY -->
      <h2 class="h2">Icons</h2>
      <p class="note">
        <a href="https://tabler.io/icons" target="_blank" rel="noopener">@tabler/icons-vue</a>,
        named import per icon (no central registry) so tree-shaking works -
        verified by hand by comparing the bundle with/without a test icon.
        Representative selection, not exhaustive.
      </p>
      <div class="icon-grid">
        <div v-for="icon in [
          ['IconBus', IconBus], ['IconBusStop', IconBusStop], ['IconList', IconList], ['IconMap', IconMap],
          ['IconStar', IconStar], ['IconStarFilled', IconStarFilled], ['IconMapPin', IconMapPin],
          ['IconChevronLeft', IconChevronLeft], ['IconChevronRight', IconChevronRight],
          ['IconSwitchVertical', IconSwitchVertical], ['IconArrowsLeftRight', IconArrowsLeftRight],
          ['IconSettings', IconSettings], ['IconX', IconX], ['IconCheck', IconCheck],
          ['IconCurrentLocation', IconCurrentLocation], ['IconWalk', IconWalk],
          ['IconMoon', IconMoon], ['IconSun', IconSun], ['IconWorld', IconWorld],
          ['IconSchool', IconSchool], ['IconBuildingHospital', IconBuildingHospital],
          ['IconBuildingStore', IconBuildingStore], ['IconBuildingCommunity', IconBuildingCommunity],
          ['IconExternalLink', IconExternalLink], ['IconDownload', IconDownload],
          ['IconHelpCircle', IconHelpCircle],
        ]" :key="icon[0]" class="icon-item">
          <component :is="icon[1]" :size="22" aria-hidden="true" />
          <code>{{ icon[0] }}</code>
        </div>
      </div>

      <!-- COMPONENTS: BUTTONS -->
      <h2 class="h2">Components</h2>
      <h3 class="h3">Buttons</h3>
      <div class="row wrap align-center">
        <div class="demo-col">
          <button type="button" class="btn-primary">Action primaire</button>
          <code>.action-btn.primary (StopInfoCard, EmptyState)</code>
        </div>
        <div class="demo-col">
          <button type="button" class="btn-secondary">Action secondaire</button>
          <code>.action-btn.secondary (StopInfoCard)</code>
        </div>
        <div class="demo-col">
          <button type="button" class="btn-low">
            <IconMap :size="16" aria-hidden="true" />
            Voir sur la carte
          </button>
          <code>.view-map-btn (ListResultsView)</code>
        </div>
        <div class="demo-col">
          <SettingsButton />
          <code>SettingsButton.vue</code>
        </div>
        <div class="demo-col">
          <ThemeToggleSwitch />
          <code>ThemeToggleSwitch.vue</code>
        </div>
        <div class="demo-col">
          <button
            type="button"
            class="fav-demo"
            :class="{ saved: favSaved }"
            @click="favSaved = !favSaved"
          >
            <IconStarFilled v-if="favSaved" :size="16" />
            <IconStar v-else :size="16" />
          </button>
          <code>.fav-btn (toggle - click it)</code>
        </div>
        <div class="demo-col">
          <div class="segmented-demo">
            <button type="button" :class="{ active: segmentedActive === 'rapide' }" @click="segmentedActive = 'rapide'">Rapide</button>
            <button type="button" :class="{ active: segmentedActive === 'tot' }" @click="segmentedActive = 'tot'">Tôt</button>
          </div>
          <code>.segmented (ResultsView, LineView)</code>
        </div>
      </div>

      <!-- BADGES & CHIPS -->
      <h3 class="h3">Badges & chips</h3>
      <div class="row wrap align-center">
        <div class="demo-col">
          <LineBadge short-name="5b" agency-id="AGENCY" />
          <code>LineBadge.vue</code>
        </div>
        <div class="demo-col">
          <FrequencyBadge reliability="high" />
          <code>FrequencyBadge reliability="high"</code>
        </div>
        <div class="demo-col">
          <FrequencyBadge reliability="medium" />
          <code>FrequencyBadge reliability="medium"</code>
        </div>
        <div class="demo-col">
          <FrequencyBadge reliability="low" />
          <code>FrequencyBadge reliability="low"</code>
        </div>
        <div class="demo-col">
          <FrequencyBadge :reliability="null" />
          <code>FrequencyBadge :reliability="null" (skeleton)</code>
        </div>
        <div class="demo-col">
          <LegChip :leg="sampleLegWalk" />
          <code>LegChip mode="WALK"</code>
        </div>
        <div class="demo-col">
          <LegChip :leg="sampleLegBus" />
          <code>LegChip mode="BUS"</code>
        </div>
      </div>

      <!-- LIST ROWS -->
      <h3 class="h3">List rows</h3>
      <div class="demo-phone">
        <ListRow tag="div">
          <template #leading>
            <span class="generic-icon"><IconBusStop :size="18" /></span>
          </template>
          <span class="row-text">ListRow.vue (generic)</span>
          <template #trailing>
            <IconChevronRight :size="16" />
          </template>
        </ListRow>
        <SearchResultRow v-for="r in sampleSearchResults" :key="r.name" :result="r" />
        <StopRow v-for="line in sampleStopRows" :key="line.shortName" :line="line" />
      </div>

      <h3 class="h3">Settings rows (SettingRow)</h3>
      <div class="demo-phone settings-card">
        <SettingRow tag="button" :icon="IconWorld">
          Langue
          <template #trailing>
            <span class="setting-value">Français</span>
            <IconChevronRight class="chevron" :size="16" />
          </template>
        </SettingRow>
        <SettingRow tag="div" :icon="IconMoon">
          Thème
          <template #trailing>
            <ThemeToggleSwitch />
          </template>
        </SettingRow>
        <SettingRow tag="a" :icon="IconExternalLink">
          Lien externe
          <template #trailing>
            <IconExternalLink :size="16" />
          </template>
        </SettingRow>
      </div>

      <!-- CARDS -->
      <h3 class="h3">Cards</h3>
      <div class="row wrap align-start">
        <div class="demo-phone">
          <EmptyState
            title="Aucun arrêt enregistré"
            subtitle="Touchez ★ sur une vue d'arrêt pour la retrouver ici."
            action-label="Explorer la carte"
          />
          <code>EmptyState.vue</code>
        </div>
        <div class="demo-phone">
          <ServiceClosedNotice />
          <code>ServiceClosedNotice.vue (uses the active city's real schedule)</code>
        </div>
        <div class="demo-phone">
          <SearchCard origin-name="Ma position" destination-name="" />
          <code>SearchCard.vue</code>
        </div>
      </div>

      <div class="row wrap align-start">
        <div class="demo-phone">
          <ItineraryCard :itinerary="sampleItinerary" :recommended="true" from-name="Ma position" to-name="UTS" />
          <code>ItineraryCard recommended</code>
        </div>
        <div class="demo-phone">
          <ItineraryCard :itinerary="sampleItinerary" :selected="true" from-name="Ma position" to-name="UTS" />
          <code>ItineraryCard selected</code>
        </div>
        <div class="demo-phone">
          <ItineraryCard :itinerary="sampleItinerary" from-name="Ma position" to-name="UTS" />
          <code>ItineraryCard (default state)</code>
        </div>
      </div>

      <div class="row wrap align-start">
        <div class="demo-phone demo-card-frame">
          <StopInfoCard :stop="realStop" primary-label="Itinéraire" />
          <code>StopInfoCard.vue - real stop (Université JKZ, live OTP)</code>
        </div>
      </div>

      <!-- HEADERS & NAVIGATION -->
      <h3 class="h3">Headers & navigation</h3>
      <div class="demo-phone no-padding">
        <div class="logo-demo">
          <LogoPill />
          <LogoPill :pill="false" />
        </div>
        <code class="pad">LogoPill.vue</code>
        <div class="logo-icons-demo">
          <div class="logo-icon-item">
            <img :src="APP_ICON" style="height:60px;width:auto" alt="icon" />
            <code>VITE_APP_ICON</code>
          </div>
          <div class="logo-icon-item" style="background:#1a1e1d;border-radius:8px;padding:8px">
            <img :src="APP_ICON" style="height:60px;width:auto" alt="icon on dark" />
            <code style="color:#aaa">on dark background</code>
          </div>
          <div class="logo-icon-item">
            <img src="/logo/icon-mono.svg" style="height:60px;width:auto" alt="mono-ink" />
            <code>icon-mono</code>
          </div>
        </div>
      </div>
      <div class="demo-phone no-padding">
        <RouteHeader from-name="Ma position" to-name="UTS" />
        <code class="pad">RouteHeader.vue</code>
      </div>
      <div class="demo-phone no-padding">
        <BottomNav />
        <code class="pad">BottomNav.vue - the real component: clicking it actually navigates</code>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Wide on purpose, like .sheet below - this page's header isn't part
   of the phone-width app shell pattern. */
.styleguide .header {
  flex: none;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 18px 16px 12px;
}

.eyebrow {
  font: 700 9px var(--font-ui);
  letter-spacing: 0.1em;
  color: var(--color-good-dot);
}

.title {
  font: 800 24px var(--font-ui);
  color: var(--color-text);
  margin-top: 2px;
}

.theme-demo {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 700 12px var(--font-ui);
  color: var(--color-muted);
}

/* Unlike every other screen, this page is a wide reference doc (color/
   icon grids benefit from real desktop width) - it never adds a
   .content-inner wrapper, so it's never capped to begin with. */
.styleguide .sheet {
  background-color: var(--color-sheet-bg);
  padding: 8px 16px 48px;
  flex: 1;
  overflow-y: auto;
}

/* .body-text is defined globally in base.css — .intro adds layout only */
.intro {
  max-width: 640px;
  margin-bottom: 24px;
}

.intro code {
  font: 600 12px monospace;
}

.h2 {
  font: 800 19px var(--font-ui);
  color: var(--color-text);
  margin: 36px 0 12px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border-strong);
}

.h2:first-of-type {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.h3 {
  font: 700 14px var(--font-ui);
  color: var(--color-text);
  margin: 20px 0 10px;
}

.note {
  font: 600 12px var(--font-ui);
  color: var(--color-muted);
  max-width: 640px;
  line-height: 1.5;
  margin-bottom: 12px;
}

.note code,
.row code,
.type-desc code,
.shadow-demo code,
.demo-col code,
.demo-phone code {
  font: 500 10px monospace;
  color: var(--color-sub);
}

.group {
  margin-bottom: 8px;
}

.row {
  display: flex;
  gap: 14px;
}

.row.wrap {
  flex-wrap: wrap;
}

.row.align-center {
  align-items: flex-start;
}

.row.align-start {
  align-items: flex-start;
}

.type-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
}

.type-row {
  display: flex;
  align-items: baseline;
  gap: 20px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--color-border);
}

.type-sample {
  flex: none;
  width: 220px;
  color: var(--color-text);
}

.type-desc {
  font: 600 12px var(--font-ui);
  color: var(--color-muted);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shadow-demo {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.shadow-box {
  width: 120px;
  height: 70px;
  border-radius: 14px;
  background: var(--color-surface);
}

.pattern-demo {
  width: 220px;
  height: 90px;
  border-radius: 16px;
  border: 1px solid var(--color-border);
  margin-bottom: 24px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 84px);
  gap: 14px;
  margin-bottom: 24px;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--color-text);
}

.demo-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

/* Phone-width frame for components designed to live inside the app's
   narrow column - showing them at desktop full width would misrepresent
   how they actually look. */
.demo-phone {
  width: 320px;
  background: var(--color-app-bg);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 16px;
}

.demo-phone.no-padding {
  padding: 0;
  overflow: hidden;
}

.demo-phone .pad {
  display: block;
  padding: 8px 12px;
}

.demo-phone.settings-card {
  background: var(--color-surface);
  padding: 0;
}

.demo-card-frame {
  background: var(--color-surface);
}

.demo-phone code {
  display: block;
  margin-top: 8px;
}

.row-text {
  font: 700 13px var(--font-ui);
  color: var(--color-text);
}

.generic-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--color-field);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.logo-demo {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--color-map-bg);
}

.logo-icons-demo {
  display: flex;
  gap: 16px;
  padding: 16px;
  align-items: flex-end;
  background: var(--color-sheet-bg);
}

.logo-icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

/* Raw CSS patterns that exist only as scoped styles inside other SFCs
   (no shared class to import) - reproduced here 1:1 for reference,
   credited in the <code> caption next to each one. */
.btn-primary {
  padding: 11px 18px;
  border-radius: 13px;
  background: var(--color-accent);
  color: var(--color-accent-text);
  font: 700 13px var(--font-ui);
}

.btn-secondary {
  padding: 11px 18px;
  border-radius: 13px;
  background: var(--color-field);
  color: var(--color-text);
  font: 700 13px var(--font-ui);
}

.btn-low {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 13px;
  background: var(--color-low-bg);
  color: var(--color-low-text);
  font: 700 13px var(--font-ui);
}

.fav-demo {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--color-field);
  color: var(--color-low-dot);
  display: flex;
  align-items: center;
  justify-content: center;
}

.fav-demo.saved {
  background: var(--color-fav-saved-bg);
  border: 1px solid var(--color-fav-saved-border);
  color: var(--color-fav-saved-text);
}

.segmented-demo {
  display: flex;
  background: var(--color-chip-bg);
  border-radius: 999px;
  padding: 2px;
}

.segmented-demo button {
  padding: 6px 12px;
  border-radius: 999px;
  font: 700 11px var(--font-ui);
  color: var(--color-chip-text);
}

.segmented-demo button.active {
  background: var(--color-accent);
  color: var(--color-accent-text);
}

.setting-value {
  font: 600 12px var(--font-ui);
  color: var(--color-muted);
}

.chevron {
  color: var(--color-sep);
}
</style>
