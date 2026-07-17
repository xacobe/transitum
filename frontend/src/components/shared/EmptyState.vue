<script setup lang="ts">
import { IconStar } from '@tabler/icons-vue'

defineProps({
  icon: { type: [Object, Function], default: () => IconStar },
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  actionLabel: { type: String, default: '' },
})
defineEmits(['action'])
</script>

<template>
  <div class="empty-state">
    <component :is="icon" class="icon" :size="28" aria-hidden="true" />
    <p class="title">{{ title }}</p>
    <p v-if="subtitle" class="subtitle">{{ subtitle }}</p>
    <button v-if="actionLabel" type="button" class="action-btn" @click="$emit('action')">
      {{ actionLabel }}
    </button>
  </div>
</template>

<style scoped>
.empty-state {
  text-align: center;
  padding: 28px 20px;
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius-map);
}

.icon {
  display: block;
  margin: 0 auto 8px;
  color: var(--color-muted);
}

.title {
  font: var(--text-body);
  font-weight: 700;
  color: var(--color-text);
}

.subtitle {
  font: var(--text-caption);
  color: var(--color-muted);
  margin-top: 4px;
}

.action-btn {
  margin-top: 14px;
  padding: 10px 18px;
  border-radius: var(--radius-md);
  background: var(--color-accent);
  color: var(--color-accent-text);
  font: var(--text-label-strong);
}
</style>
