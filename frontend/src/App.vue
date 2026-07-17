<script setup lang="ts">
import { watch } from 'vue'
import { RouterView } from 'vue-router'
import BottomNav from '@/components/layout/BottomNav.vue'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import { useI18n } from 'vue-i18n'
import { useCityStore } from '@/stores/city'
import InstallBanner from '@/components/layout/InstallBanner.vue'

const { isOnline } = useOnlineStatus()
const { t } = useI18n()
const cityStore = useCityStore()

const APP_NAME = import.meta.env.VITE_APP_NAME as string

watch(
  () => cityStore.activeCity,
  (city) => {
    document.title = city ? `${city.displayName} · ${APP_NAME}` : APP_NAME
  },
  { immediate: true },
)
</script>

<template>
  <div class="app-shell">
    <Transition name="offline-banner">
      <div v-if="!isOnline" class="offline-banner" role="status" aria-live="polite">
        {{ t('common.offline') }}
      </div>
    </Transition>
    <InstallBanner />
    <main>
      <RouterView />
    </main>
    <BottomNav />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
}

main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.offline-banner {
  flex: none;
  background: var(--color-low-bg);
  color: var(--color-low-text);
  font: 600 12px var(--font-ui);
  text-align: center;
  padding: 6px 16px;
  z-index: 100;
}

.offline-banner-enter-active,
.offline-banner-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}
.offline-banner-enter-from,
.offline-banner-leave-to {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
}
.offline-banner-enter-to,
.offline-banner-leave-from {
  max-height: 40px;
}
</style>
