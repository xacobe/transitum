<script setup lang="ts">
import ListRow from '@/components/shared/ListRow.vue'
import {
  IconBusStop,
  IconBuildingHospital,
  IconBuildingStore,
  IconBuildingBank,
  IconSchool,
  IconPill,
  IconBed,
  IconToolsKitchen2,
  IconShoppingCart,
  IconMapPin,
  IconWorld,
} from '@tabler/icons-vue'
import type { SearchResult, SearchResultIcon } from '@/types'

const ICONS: Record<SearchResultIcon, unknown> = {
  stop:         IconBusStop,
  hospital:     IconBuildingHospital,
  marketplace:  IconBuildingStore,
  university:   IconSchool,
  neighbourhood:IconMapPin,
  transit:      IconBusStop,
  bank:         IconBuildingBank,
  pharmacy:     IconPill,
  hotel:        IconBed,
  food:         IconToolsKitchen2,
  shop:         IconShoppingCart,
  place:        IconWorld,
}

defineProps<{
  result: SearchResult
}>()
defineEmits(['select'])
</script>

<template>
  <ListRow @click="$emit('select')">
    <template #leading>
      <span class="icon" aria-hidden="true">
        <component :is="ICONS[result.icon] ?? IconMapPin" :size="18" />
      </span>
    </template>
    <span class="name">{{ result.name }}</span>
    <span v-if="result.sub" class="sub">{{ result.sub }}</span>
  </ListRow>
</template>

<style scoped>
.icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-icon);
  background: var(--color-field);
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}

.name {
  font: 700 13px var(--font-ui);
  color: var(--color-text);
}

.sub {
  font: 600 11px var(--font-ui);
  color: var(--color-muted);
  margin-top: 2px;
}
</style>
