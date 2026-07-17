<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '@/stores/theme'

const theme = useThemeStore()
const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="toggle-switch"
    :class="{ on: theme.isDark }"
    role="switch"
    :aria-checked="theme.isDark"
    :aria-label="t('common.toggleDarkTheme')"
    @click="theme.toggleTheme()"
  >
    <span class="knob" />
  </button>
</template>

<style scoped>
.toggle-switch {
  width: 38px;
  height: 22px;
  border-radius: var(--radius-full);
  background: var(--color-border-strong);
  position: relative;
  flex: none;
  transition: background .2s;
}

.toggle-switch.on {
  background: var(--color-accent);
}

.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform .2s;
}

.toggle-switch.on .knob {
  transform: translateX(16px);
}
</style>
