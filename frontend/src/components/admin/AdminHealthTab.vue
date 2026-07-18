<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CITIES } from '@/cities'

interface HealthCheck {
  label: string; ok: boolean; status: number | null; ms: number | null
}

const emit = defineEmits<{
  /** True when any check failed - parent shows the "!" badge on the tab. */
  alert: [hasFailure: boolean]
}>()

const healthData    = ref<HealthCheck[]>([])
const healthLoading = ref(false)

async function checkOne(label: string, url: string, opts: { method?: string } = {}): Promise<HealthCheck> {
  const t0 = Date.now()
  try {
    const r = await fetch(url, { method: opts.method ?? 'GET', signal: AbortSignal.timeout(5000) })
    return { label, ok: r.ok, status: r.status, ms: Date.now() - t0 }
  } catch {
    return { label, ok: false, status: null, ms: null }
  }
}

async function loadHealth() {
  healthLoading.value = true
  const checks = await Promise.all([
    checkOne('PocketBase API', '/pb/api/health'),
    checkOne('Routing service', '/routing/health'),
    ...CITIES.map(c => checkOne(`${c.displayName} — routes.json`, `/data/${c.slug}/routes.json`, { method: 'HEAD' })),
    ...CITIES.map(c => checkOne(`${c.displayName} — stops.bin`,   `/data/${c.slug}/stops.bin`,   { method: 'HEAD' })),
  ])
  healthData.value    = checks
  healthLoading.value = false
  emit('alert', checks.some(h => !h.ok))
}

onMounted(loadHealth)
</script>

<template>
  <div class="section">
    <button type="button" class="admin-btn small" style="align-self:flex-start" @click="loadHealth">↺ Check</button>
    <div v-if="healthLoading" class="admin-state">Checking…</div>
    <div v-else class="health-list">
      <div v-for="h in healthData" :key="h.label" class="health-row">
        <span :class="['health-dot', h.ok ? 'ok' : 'fail']" />
        <span class="health-label">{{ h.label }}</span>
        <span class="health-meta">
          <template v-if="h.ok">{{ h.ms }} ms</template>
          <template v-else>{{ h.status ? `HTTP ${h.status}` : 'No response' }}</template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.health-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.health-row {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-icon);
  padding: 10px 14px;
}

.health-dot {
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.health-dot.ok   { background: var(--color-good-dot); }
.health-dot.fail { background: var(--color-danger-dot); }

.health-label { font: 600 13px var(--font-ui); color: var(--color-text); flex: 1; }
.health-meta  { font: 600 12px var(--font-ui); color: var(--color-muted); flex: none; }
</style>
