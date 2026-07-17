<script setup lang="ts">
import { useRoute, RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { IconList, IconMap, IconBus, IconStar } from '@tabler/icons-vue'
import { customization } from '@/customization'
import type { CustomNavItem } from '@/customization'

const route = useRoute()
const { t, locale } = useI18n()

function isActive(...names: string[]): boolean {
  return names.includes(route.name as string)
}

function isCustomItemActive(item: CustomNavItem): boolean {
  return item.activeRouteNames ? isActive(...item.activeRouteNames) : route.path === item.to
}

function labelOf(label: CustomNavItem['label']): string {
  return typeof label === 'string' ? label : (label[locale.value] ?? Object.values(label)[0] ?? '')
}
</script>

<template>
  <nav class="bottom-nav" :aria-label="t('nav.main')">
    <div class="bottom-nav-inner">
      <RouterLink
        to="/"
        class="nav-item"
        :class="{ active: isActive('list', 'listSearch', 'listResults') }"
      >
        <IconList class="icon" :size="22" aria-hidden="true" />
        <span class="label">{{ t('nav.list') }}</span>
      </RouterLink>
      <RouterLink to="/carte" class="nav-item" :class="{ active: isActive('home', 'search', 'mapResults') }">
        <IconMap class="icon" :size="22" aria-hidden="true" />
        <span class="label">{{ t('nav.map') }}</span>
      </RouterLink>
      <RouterLink to="/lines" class="nav-item" :class="{ active: isActive('lines', 'line') }">
        <IconBus class="icon" :size="22" aria-hidden="true" />
        <span class="label">{{ t('nav.lines') }}</span>
      </RouterLink>
      <RouterLink to="/favorites" class="nav-item" :class="{ active: isActive('favorites') }">
        <IconStar class="icon" :size="22" aria-hidden="true" />
        <span class="label">{{ t('nav.favorites') }}</span>
      </RouterLink>
      <RouterLink
        v-for="item in customization.navItems"
        :key="item.to"
        :to="item.to"
        class="nav-item"
        :class="{ active: isCustomItemActive(item) }"
      >
        <component :is="item.icon" class="icon" :size="22" aria-hidden="true" />
        <span class="label">{{ labelOf(item.label) }}</span>
      </RouterLink>
    </div>
  </nav>
</template>

<style scoped>
.bottom-nav {
  height: 62px;
  flex: none;
  display: flex;
  justify-content: center;
  background: var(--color-nav-bg);
  border-top: 1px solid var(--color-nav-border);
}

.bottom-nav-inner {
  display: flex;
  width: 100%;
  max-width: var(--content-max-width);
}

.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: var(--color-nav-inactive);
  font: 600 10px var(--font-ui);
}

.nav-item .icon {
  stroke-width: 1.75;
}

.nav-item.active {
  color: var(--color-nav-active);
}
</style>
