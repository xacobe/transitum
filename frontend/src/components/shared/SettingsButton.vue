<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { IconSettings } from '@tabler/icons-vue'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

function goSettings() {
  // Store the current route name in the History API state so SettingsView
  // can return to it when the user taps close — without polluting the URL.
  router.push({ name: 'settings', state: { from: route.name as string } })
}
</script>

<template>
  <button type="button" class="settings-btn" :aria-label="t('nav.settings')" @click="goSettings">
    <IconSettings :size="20" :stroke-width="2.25" />
  </button>
</template>

<style scoped>
.settings-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-accent);
  color: var(--color-accent-text);
}
</style>
