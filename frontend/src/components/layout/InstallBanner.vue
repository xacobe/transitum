<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useInstallPrompt } from '@/composables/useInstallPrompt'
import { APP_NAME } from '@/services/appConfig'

const { t } = useI18n()
const { isStandalone, isIos, isDismissed, dismiss: markDismissed, canInstall, install: triggerInstall } = useInstallPrompt()

const showAndroid = ref(false)
const showIos = ref(false)

onMounted(() => {
  if (isStandalone() || isDismissed()) return
  if (isIos()) { showIos.value = true; return }
  // canInstall becomes true when beforeinstallprompt fires (may be async)
  watch(canInstall, (v) => { if (v && !isDismissed()) showAndroid.value = true }, { immediate: true })
})

function dismiss() {
  markDismissed()
  showAndroid.value = false
  showIos.value = false
}

async function install() {
  await triggerInstall()
  showAndroid.value = false
}
</script>

<template>
  <Transition name="install-banner">
    <div v-if="showAndroid" class="install-banner" role="complementary">
      <span class="install-banner__text">{{ t('install.android', { appName: APP_NAME }) }}</span>
      <button class="install-banner__btn install-banner__btn--primary" @click="install">
        {{ t('install.install') }}
      </button>
      <button class="install-banner__btn install-banner__btn--close" :aria-label="t('common.close')" @click="dismiss">
        ✕
      </button>
    </div>
    <div v-else-if="showIos" class="install-banner" role="complementary">
      <span class="install-banner__text">{{ t('install.ios', { appName: APP_NAME }) }}</span>
      <button class="install-banner__btn install-banner__btn--close" :aria-label="t('common.close')" @click="dismiss">
        ✕
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.install-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-low-bg);
  color: var(--color-low-text);
  font: 500 13px var(--font-ui);
}

.install-banner__text {
  flex: 1;
  line-height: 1.4;
}

.install-banner__btn {
  flex: none;
  border: none;
  border-radius: 6px;
  font: inherit;
  cursor: pointer;
  padding: 6px 12px;
}

.install-banner__btn--primary {
  background: var(--color-low-text);
  color: var(--color-low-bg);
  font-weight: 700;
}

.install-banner__btn--close {
  background: transparent;
  color: var(--color-low-text);
  padding: 6px 8px;
  font-size: 20px;
  line-height: 1;
  opacity: 0.7;
}

.install-banner-enter-active,
.install-banner-leave-active {
  transition: all 0.25s ease;
  overflow: hidden;
}

.install-banner-enter-from,
.install-banner-leave-to {
  max-height: 0;
  opacity: 0;
}

.install-banner-enter-to,
.install-banner-leave-from {
  max-height: 80px;
}
</style>
