<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import SettingRow from '@/components/shared/SettingRow.vue'
import { useFrequency } from '@/composables/useFrequency'
import { useCityStore } from '@/stores/city'
import { loadCityRoutesMeta } from '@/services/cityData'
import { APP_NAME } from '@/services/appConfig'
import { IconChevronLeft, IconBuildingCommunity, IconExternalLink } from '@tabler/icons-vue'

const router = useRouter()
const city = useCityStore()
const { t } = useI18n()
const { peakHeadwayMinutes, serviceStartLabel, serviceEndLabel } = useFrequency()

// Whether every line in this city has a real published schedule (see
// RouteDirection.hasFixedSchedule) - decides which howItWorksBody variant
// to show. Not city-wide config (transitSource.type): a single official-gtfs
// feed can still mix schedule-based and frequency-based lines, so this is
// computed from the actual per-line data. Defaults to false (the frequency
// explanation, the more broadly-true framing) while loading and if any
// single line lacks a fixed schedule.
const cityHasOnlyFixedSchedules = ref(false)

async function loadScheduleKind(): Promise<void> {
  const routes = await loadCityRoutesMeta(city.activeSlug)
  cityHasOnlyFixedSchedules.value = routes.every((r) => r.directions.every((d) => d.hasFixedSchedule))
}

onMounted(loadScheduleKind)
watch(() => city.activeSlug, loadScheduleKind)

function goBack() {
  // router.back() restores the Settings history entry including its
  // state.from — push({ name: 'settings' }) would create a new entry
  // without it, breaking the close button's "return to origin" logic.
  router.back()
}
</script>

<template>
  <div class="screen">
    <div class="header">
      <button type="button" class="back-btn" :aria-label="t('common.back')" @click="goBack">
        <IconChevronLeft :size="24" />
      </button>
      <div class="title">{{ t('settings.help') }}</div>
    </div>

    <div class="screen-content pattern-tile-bg">
      <div class="content-inner">
        <div class="section-title">{{ t('help.howItWorksTitle') }}</div>
        <div class="info-card">
          <p class="body-text">
            {{
              t(cityHasOnlyFixedSchedules ? 'help.howItWorksBodyOfficial' : 'help.howItWorksBodyFrequency', {
                appName: APP_NAME,
                agency: city.activeCity.agencies[0]?.agencyName ?? '',
                headway: peakHeadwayMinutes,
                start: serviceStartLabel,
                end: serviceEndLabel,
              })
            }}
          </p>
        </div>

        <div class="section-title section-title-spaced">{{ t('help.networkTitle') }}</div>
        <div class="settings-card">
          <SettingRow
            v-for="agency in city.activeCity.agencies"
            :key="agency.agencyId"
            tag="a"
            :icon="IconBuildingCommunity"
            :href="agency.agencyUrl"
            target="_blank"
            rel="noopener"
          >
            {{ t('help.agency', { agency: agency.agencyName }) }}
            <template #trailing>
              <IconExternalLink class="chevron" :size="16" aria-hidden="true" />
            </template>
          </SettingRow>
        </div>

        <p class="body-text privacy-note">{{ t('help.privacyNote', { appName: APP_NAME }) }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header {
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 14px 16px;
}

.back-btn {
  color: var(--color-text);
  flex: none;
}

.title {
  font: 800 18px var(--font-ui);
  color: var(--color-text);
}

.screen-content {
  padding: 0 16px 16px;
  overflow-y: auto;
}

.section-title {
  font: 700 12px var(--font-ui);
  color: var(--color-muted);
  margin-bottom: 8px;
}

.section-title-spaced {
  margin-top: 20px;
}

.info-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: 14px;
}


.privacy-note {
  margin-top: 24px;
  padding-bottom: 8px;
  text-align: center;
  font-size: 11px;
}

.settings-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
}

.chevron {
  flex: none;
  color: var(--color-muted);
}
</style>
