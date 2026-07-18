<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CITIES } from '@/cities'
import { formatDateTime } from '@/services/format'

const GITHUB_ACTIONS_URL = import.meta.env.VITE_REPOSITORY_URL
  ? `${import.meta.env.VITE_REPOSITORY_URL}/actions`
  : null

const syncData    = ref<Record<string, string | null> | null>(null)
const syncLoading = ref(false)
const versionData = ref<Record<string, { generatedAt?: string } | null>>({})

async function loadSync() {
  syncLoading.value = true
  try {
    const r = await fetch('/data/last-osm-sync.json')
    syncData.value = await r.json()
    for (const city of CITIES) {
      try {
        const rv = await fetch(`/data/${city.slug}/version.json`)
        versionData.value[city.slug] = await rv.json()
      } catch { /* skip */ }
    }
  } catch { /* skip */ } finally {
    syncLoading.value = false
  }
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return -1
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / 86_400_000)
}

onMounted(loadSync)
</script>

<template>
  <div class="section">
    <div v-if="syncLoading" class="admin-state">Loading…</div>
    <div v-else>
      <table class="quality-table">
        <thead>
          <tr>
            <th>City</th>
            <th>Last OSM sync</th>
            <th>Ago</th>
            <th>Data generated</th>
            <th>Ago</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="city in CITIES" :key="city.slug">
            <td>{{ city.displayName }}</td>
            <td class="cell-muted">{{ formatDateTime(syncData?.[city.slug], '—') }}</td>
            <td :class="['cell-days', daysSince(syncData?.[city.slug]) > 7 ? 'cell-warn' : '']">
              {{ daysSince(syncData?.[city.slug]) >= 0 ? daysSince(syncData?.[city.slug]) + ' days' : '?' }}
            </td>
            <td class="cell-muted">{{ formatDateTime(versionData[city.slug]?.generatedAt, '—') }}</td>
            <td>{{ daysSince(versionData[city.slug]?.generatedAt) >= 0 ? daysSince(versionData[city.slug]?.generatedAt) + ' days' : '?' }}</td>
          </tr>
        </tbody>
      </table>
      <a
        v-if="GITHUB_ACTIONS_URL"
        :href="GITHUB_ACTIONS_URL"
        target="_blank"
        rel="noopener"
        class="gh-link"
      >
        Open GitHub Actions →
      </a>
    </div>
  </div>
</template>

<style scoped>
.quality-table {
  width: 100%;
  border-collapse: collapse;
  font: var(--text-caption);
}

.quality-table th {
  text-align: left;
  color: var(--color-muted);
  font-weight: 700;
  padding: 4px 8px;
  border-bottom: 1px solid var(--color-border-strong);
}

.quality-table td {
  padding: 5px 8px;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border);
}

.quality-table .cell-muted { color: var(--color-muted); }
.quality-table .cell-warn  { color: var(--color-low-text); font-weight: 700; }
.cell-days  { color: var(--color-text); }

.gh-link {
  display: inline-block;
  margin-top: 12px;
  font: var(--text-label-strong);
  color: var(--color-accent);
  text-decoration: none;
}
</style>
