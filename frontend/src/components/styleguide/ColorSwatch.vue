<script setup lang="ts">
defineProps({
  varName: { type: String, required: true }, // e.g. '--color-accent'
  label: { type: String, required: true },
})
</script>

<template>
  <div class="swatch">
    <div class="swatch-box" :style="{ background: `var(${varName})` }" />
    <div class="swatch-label">{{ label }}</div>
    <code class="swatch-var">{{ varName }}</code>
  </div>
</template>

<style scoped>
.swatch {
  width: 116px;
}

.swatch-box {
  height: 56px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
}

.swatch-label {
  margin-top: 6px;
  font: 700 12px var(--font-ui);
  color: var(--color-text);
}

.swatch-var {
  display: block;
  font: 500 10px monospace;
  color: var(--color-muted);
  word-break: break-all;
}
</style>
