<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/shared/PageHeader.vue'
import SettingRow from '@/components/shared/SettingRow.vue'
import ThemeToggleSwitch from '@/components/shared/ThemeToggleSwitch.vue'
import { useThemeStore } from '@/stores/theme'
import { useCityStore } from '@/stores/city'
import { CITIES } from '@/cities'
import { setLocale, localeName, SUPPORTED_LOCALES } from '@/i18n'
import { useOfflineTiles } from '@/composables/useOfflineTiles'
import { APP_NAME } from '@/services/appConfig'
import { formatShortDate } from '@/services/format'
import {
  IconWorld,
  IconSun,
  IconMoon,
  IconHelpCircle,
  IconMapPin,
  IconChevronRight,
  IconX,
  IconTrash,
  IconRefresh,
  IconSpeakerphone,
  IconDeviceMobilePlus,
} from '@tabler/icons-vue'
import ReportModal from '@/components/shared/ReportModal.vue'
import { useInstallPrompt } from '@/composables/useInstallPrompt'

const router = useRouter()
const theme = useThemeStore()
const city = useCityStore()
const { t, locale } = useI18n()
const {
  isDownloaded,
  isDownloading,
  getProgress,
  getSizeMb,
  downloadCity,
  deleteCity,
  getDownloadedAt,
  isUpdateAvailable,
  isUpdatingData,
  updateDataFiles,
} = useOfflineTiles()

const downloadErrors = ref<Record<string, boolean>>({})
const downloadErrMsg = ref<Record<string, string>>({})
const updateErrors   = ref<Record<string, boolean>>({})

async function handleDownload(slug: string) {
  downloadErrors.value[slug] = false
  downloadErrMsg.value[slug] = ''
  try {
    await downloadCity(slug)
  } catch (err) {
    downloadErrors.value[slug] = true
    downloadErrMsg.value[slug] = (err as Error)?.message || String(err)
  }
}

async function handleUpdate(slug: string) {
  updateErrors.value[slug] = false
  try {
    await updateDataFiles(slug)
  } catch {
    updateErrors.value[slug] = true
  }
}

function cycleLocale() {
  const idx = SUPPORTED_LOCALES.findIndex((l) => l === locale.value)
  setLocale(SUPPORTED_LOCALES[(idx + 1) % SUPPORTED_LOCALES.length])
}

function goHelp() {
  router.push({ name: 'help' })
}

const reportOpen = ref(false)

const { isStandalone, isIos, canInstall, install: triggerInstall } = useInstallPrompt()
const showInstallRow = computed(() => !isStandalone() && (canInstall.value || isIos()))

function close() {
  // The main screens we can safely return to — excludes settings/help
  // themselves so navigating directly to /settings doesn't loop back there.
  const mainRoutes = ['home', 'list', 'lines', 'favorites']
  const from = window.history.state?.from
  router.push({ name: mainRoutes.includes(from) ? from : 'home' })
}
</script>

<template>
  <div class="screen">
    <PageHeader :eyebrow="t('settings.eyebrow')" :title="t('nav.settings')">
      <button type="button" class="close-btn" :aria-label="t('common.close')" @click="close">
        <IconX :size="20" />
      </button>
    </PageHeader>
    <div class="screen-content">
      <div class="content-inner">
        <div class="settings-card">
          <SettingRow v-if="SUPPORTED_LOCALES.length > 1" tag="button" :icon="IconWorld" @click="cycleLocale">
            {{ t('settings.language') }}
            <template #trailing>
              <span class="setting-value">{{ localeName(locale) }}</span>
              <IconChevronRight class="chevron" :size="16" aria-hidden="true" />
            </template>
          </SettingRow>
          <SettingRow :icon="theme.isDark ? IconSun : IconMoon">
            {{ t('settings.theme') }}
            <template #trailing>
              <span class="setting-value">{{ theme.isDark ? t('settings.themeDark') : t('settings.themeLight') }}</span>
              <ThemeToggleSwitch />
            </template>
          </SettingRow>
          <SettingRow tag="button" :icon="IconHelpCircle" @click="goHelp">
            {{ t('settings.help') }}
            <template #trailing>
              <IconChevronRight class="chevron" :size="16" aria-hidden="true" />
            </template>
          </SettingRow>
          <SettingRow tag="button" :icon="IconSpeakerphone" @click="reportOpen = true">
            {{ t('report.button') }}
            <template #trailing>
              <IconChevronRight class="chevron" :size="16" aria-hidden="true" />
            </template>
          </SettingRow>
          <SettingRow v-if="showInstallRow" tag="button" :icon="IconDeviceMobilePlus" @click="isIos() ? undefined : triggerInstall()">
            {{ t('settings.installApp') }}
            <template #trailing>
              <span v-if="isIos()" class="setting-value">{{ t('settings.installIosHint') }}</span>
              <IconChevronRight v-else class="chevron" :size="16" aria-hidden="true" />
            </template>
          </SettingRow>
        </div>

        <div class="section-title">{{ t('settings.city') }}</div>
        <p class="offline-note body-text">{{ t('settings.offlineNote') }}</p>

        <div
          v-for="c in CITIES"
          :key="c.slug"
          class="city-card"
          :class="{ selected: c.slug === city.activeSlug }"
          @click="city.setCity(c.slug)"
        >
          <IconMapPin :size="18" class="city-icon" aria-hidden="true" />
          <div class="city-info">
            <span class="city-name">{{ c.displayName }}</span>
            <span class="city-sub">
              <template v-if="isDownloaded(c.slug)">
                {{ t('settings.offlineReady') }}{{ getDownloadedAt(c.slug) ? ' · ' + formatShortDate(getDownloadedAt(c.slug), locale) : '' }}
              </template>
              <template v-else>{{ t('settings.offlineSub') }}</template>
            </span>
          </div>

          <!-- Downloading: progress bar -->
          <template v-if="isDownloading(c.slug)">
            <div class="offline-progress-wrap">
              <div
                class="offline-progress-bar"
                :class="{ 'offline-progress-bar--indeterminate': getProgress(c.slug) === 0 }"
                :style="{ width: `${Math.round(getProgress(c.slug) * 100)}%` }"
              />
            </div>
            <span class="offline-pct">
              {{ getProgress(c.slug) > 0 ? `${Math.round(getProgress(c.slug) * 100)}%` : '…' }}
            </span>
          </template>

          <!-- Downloaded full: update state / size + delete -->
          <template v-else-if="isDownloaded(c.slug)">
            <template v-if="isUpdatingData(c.slug)">
              <span class="offline-size">{{ t('settings.offlineUpdating') }}</span>
            </template>
            <template v-else-if="updateErrors[c.slug]">
              <button type="button" class="offline-btn offline-btn--error" @click.stop="handleUpdate(c.slug)">
                {{ t('settings.offlineUpdateError') }}
              </button>
            </template>
            <template v-else-if="isUpdateAvailable(c.slug)">
              <button type="button" class="offline-btn offline-btn--update" @click.stop="handleUpdate(c.slug)">
                <IconRefresh :size="13" aria-hidden="true" />
                {{ t('settings.offlineUpdate') }}
              </button>
            </template>
            <template v-else>
              <span class="offline-size good">
                {{ getSizeMb(c.slug) ? t('settings.offlineReadySize', { mb: getSizeMb(c.slug) }) : '✓' }}
              </span>
            </template>
            <button type="button" class="offline-btn offline-btn--delete" :aria-label="t('settings.offlineDelete')" @click.stop="deleteCity(c.slug)">
              <IconTrash :size="15" aria-hidden="true" />
            </button>
          </template>

          <!-- Error: retry -->
          <template v-else-if="downloadErrors[c.slug]">
            <button type="button" class="offline-btn offline-btn--error" @click.stop="handleDownload(c.slug)">
              {{ t('settings.offlineError') }}
            </button>
            <span v-if="downloadErrMsg[c.slug]" class="offline-errmsg">{{ downloadErrMsg[c.slug] }}</span>
          </template>

          <!-- Not downloaded -->
          <template v-else>
            <button type="button" class="offline-btn offline-btn--download" @click.stop="handleDownload(c.slug)">
              {{ t('settings.offlineDownload', { mb: c.offlineMb }) }}
            </button>
          </template>

        </div>

        <p class="footer-text">{{ t('settings.moreCitiesSoon', { appName: APP_NAME }) }}</p>
        <p class="footer-text">{{ t('settings.footer', { appName: APP_NAME }) }}</p>
        <p class="footer-text footer-credit">
          {{ t('settings.credit') }}
          <a href="https://www.xacobe.net" target="_blank" rel="noopener">xacobe.net</a>
          · <a href="mailto:x@xacobe.net">x@xacobe.net</a>
        </p>
      </div>
    </div>
  </div>

  <ReportModal
    v-if="reportOpen"
    entity-type="general"
    entity-id=""
    entity-name=""
    :city="city.activeSlug"
    @close="reportOpen = false"
  />
</template>

<style scoped>
.close-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.screen-content {
  padding: 0 16px 16px;
}

.settings-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  margin-bottom: 18px;
}

.chevron {
  flex: none;
  color: var(--color-muted);
}

.chevron.good {
  color: var(--color-good-text);
}

.setting-value {
  font: 600 12px var(--font-ui);
  color: var(--color-muted);
}

.section-title {
  font: 700 12px var(--font-ui);
  color: var(--color-muted);
  margin-bottom: 8px;
}

.footer-text {
  text-align: center;
  font: 600 11px var(--font-ui);
  color: var(--color-sub);
  padding: 8px 0;
}

.footer-credit {
  padding-top: 0;
}

.footer-credit a {
  color: var(--color-sub);
  text-decoration: underline;
}

.offline-note {
  margin-bottom: 10px;
}

.city-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 13px 14px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  margin-bottom: 10px;
  cursor: pointer;
}
.city-card.selected {
  border-color: var(--color-accent);
  border-width: 2px;
  padding: 12px 13px;
}

.city-icon {
  flex: none;
  color: var(--color-muted);
}
.city-card.selected .city-icon {
  color: var(--color-accent);
}

.city-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.city-name {
  font: 600 14px var(--font-ui);
  color: var(--color-text);
}
.city-sub {
  font: 600 11px var(--font-ui);
  color: var(--color-muted);
}

.offline-size {
  font: 600 12px var(--font-ui);
  color: var(--color-muted);
  white-space: nowrap;
}
.offline-size.good { color: var(--color-good-dot); }

.offline-btn {
  flex: none;
  padding: 7px 12px;
  border-radius: var(--radius-icon);
  font: var(--text-caption);
  font-weight: 700;
  white-space: nowrap;
}
.offline-btn--download {
  background: var(--color-accent);
  color: var(--color-accent-text);
}
.offline-btn--delete {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-muted);
  display: flex;
  align-items: center;
  padding: 7px 10px;
}
.offline-btn--error {
  background: var(--color-danger-bg);
  color: var(--color-danger-text);
  border: 1px solid var(--color-danger-dot);
}

.offline-btn--update {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--color-info-bg);
  border: 1px solid var(--color-info-dot);
  color: var(--color-info-text);
}

.offline-progress-wrap {
  width: 80px;
  flex: none;
  height: 4px;
  background: var(--color-border);
  border-radius: 2px;
  overflow: hidden;
}
.offline-progress-bar {
  height: 100%;
  background: var(--color-accent);
  border-radius: 2px;
  transition: width 0.3s;
}
.offline-progress-bar--indeterminate {
  width: 40% !important;
  animation: offline-slide 1.4s ease-in-out infinite;
}
@keyframes offline-slide {
  0%   { transform: translateX(-150%); }
  100% { transform: translateX(350%); }
}
.offline-errmsg {
  font-size: 10px;
  color: var(--color-error);
  max-width: 160px;
  word-break: break-all;
}
.offline-pct {
  flex: none;
  font: 700 12px var(--font-figures);
  color: var(--color-accent);
  min-width: 34px;
  text-align: right;
}
</style>
