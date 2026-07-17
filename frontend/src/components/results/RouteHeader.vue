<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { IconChevronLeft, IconSwitchVertical } from '@tabler/icons-vue'

defineProps({
  fromName: { type: String, default: '' },
  toName: { type: String, default: '' },
})
defineEmits(['back', 'swap', 'edit-from', 'edit-to'])

const { t } = useI18n()
</script>

<template>
  <div class="route-header">
    <div class="bar">
      <button type="button" class="back-btn" :aria-label="t('common.back')" @click="$emit('back')">
        <IconChevronLeft :size="24" />
      </button>
      <div class="field-pair">
        <button type="button" class="field-row" @click="$emit('edit-from')">{{ fromName }}</button>
        <div class="field-sep" />
        <button type="button" class="field-row" @click="$emit('edit-to')">{{ toName }}</button>
        <button
          type="button"
          class="swap-btn"
          :aria-label="t('common.swap')"
          @click="$emit('swap')"
        >
          <IconSwitchVertical :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.route-header {
  flex: none;
  background: var(--color-header-bg);
}

.bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: var(--content-max-width);
  margin: 0 auto;
  padding: 14px 16px;
}

.back-btn {
  color: var(--color-header-text);
  flex: none;
}

.field-pair {
  flex: 1;
  position: relative;
  background: var(--color-header-field);
  border-radius: var(--radius-card);
  padding: 4px 0;
}

.field-row {
  display: block;
  width: 100%;
  padding: 8px 14px;
  font: var(--text-label);
  color: var(--color-header-text);
  text-align: left;
}

.field-sep {
  height: 1px;
  margin: 0 14px;
  background: var(--color-header-div);
}

.swap-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--color-header-text);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
