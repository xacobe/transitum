<script setup lang="ts">
const props = defineProps({
  // 'div' for rows that already contain another interactive element (a
  // real button inside a button is invalid HTML) or that aren't clickable.
  tag: { type: String, default: 'button' },
  clickable: { type: Boolean, default: true },
})
const emit = defineEmits(['click'])

function onClick() {
  if (props.clickable) emit('click')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.clickable || props.tag === 'button') return
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  emit('click')
}
</script>

<template>
  <component
    :is="tag"
    :type="tag === 'button' ? 'button' : undefined"
    class="list-row"
    :role="tag !== 'button' && clickable ? 'button' : undefined"
    :tabindex="tag !== 'button' && clickable ? 0 : undefined"
    @click="onClick"
    @keydown="onKeydown"
  >
    <slot name="leading" />
    <span class="list-row-info">
      <slot />
    </span>
    <slot name="trailing" />
  </component>
</template>

<style scoped>
.list-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  text-align: left;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-3);
  margin-bottom: var(--space-2);
  color: var(--color-text);
}

.list-row-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.list-row[role='button'] {
  cursor: pointer;
}
</style>
