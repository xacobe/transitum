<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CITIES } from '@/cities'
import { loadCityRoutes } from '@/services/cityData'

interface SummaryCity {
  slug: string; name: string; lines: number; stops: number; withShape: number; error?: boolean
}

// Pending report counts come from AdminReportsTab via the parent (reports are
// an authenticated PocketBase collection - loaded once there, not re-fetched here).
const props = defineProps<{
  pendingByCity: Record<string, number>
}>()

const summaryData    = ref<SummaryCity[]>([])
const summaryLoading = ref(false)

async function loadSummary() {
  summaryLoading.value = true
  summaryData.value = await Promise.all(CITIES.map(async (city): Promise<SummaryCity> => {
    try {
      const routes = await loadCityRoutes(city.slug)
      const withShape = routes.filter(r => r.directions.some(d => d.points.length > 2)).length
      const stopIds = new Set<string>()
      for (const route of routes) {
        for (const dir of route.directions) {
          for (const s of dir.stops) stopIds.add(s.id)
        }
      }
      return {
        slug: city.slug, name: city.displayName,
        lines: routes.length, stops: stopIds.size, withShape,
      }
    } catch {
      return { slug: city.slug, name: city.displayName, lines: 0, stops: 0, withShape: 0, error: true }
    }
  }))
  summaryLoading.value = false
}

onMounted(loadSummary)
</script>

<template>
  <div class="section">
    <div v-if="summaryLoading" class="admin-state">Loading…</div>
    <div v-else class="summary-grid">
      <div v-for="city in summaryData" :key="city.slug" class="summary-card">
        <div class="summary-city-name">{{ city.name }}</div>
        <div v-if="city.error" class="admin-state error">Failed to load</div>
        <template v-else>
          <div class="stat-row">
            <span class="stat-label">Lines</span>
            <span class="stat-value">{{ city.lines }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Stops</span>
            <span class="stat-value">{{ city.stops }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Shapes with data</span>
            <span class="stat-value">{{ city.withShape }} / {{ city.lines }}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Pending reports</span>
            <span :class="['stat-value', (props.pendingByCity[city.slug] ?? 0) > 0 ? 'stat-warn' : '']">
              {{ props.pendingByCity[city.slug] ?? 0 }}
            </span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.summary-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: 14px;
}

.summary-city-name {
  font: var(--text-heading-sm);
  font-size: 15px;
  color: var(--color-text);
  margin-bottom: 10px;
}

.stat-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
  border-bottom: 1px solid var(--color-border);
}

.stat-row:last-child { border-bottom: none; }

.stat-label { font: 600 12px var(--font-ui); color: var(--color-muted); }
.stat-value { font: 700 13px var(--font-ui); color: var(--color-text); }
.stat-value.stat-warn { color: var(--color-danger-text); }
</style>
