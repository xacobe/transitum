<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CITIES } from '@/cities'
import { haversineMeters, latLonBounds } from '@/services/geo'
import { loadCityRoutes } from '@/services/cityData'

interface QualityItem {
  key: string; line: string; dir: string | undefined; pts: number
  distKm: string; reason: string; points: [number, number][]; stops: { lat: number; lon: number; name: string }[]
}
interface QualityCity {
  slug: string; name: string; total: number; sparse: number; items: QualityItem[]; error?: boolean
}

const qualityData    = ref<QualityCity[]>([])
const qualityLoading = ref(false)
const expandedQualityKey = ref<string | null>(null)

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineMeters(lat1, lon1, lat2, lon2) / 1000
}

// Tiny inline SVG preview of a sparse route shape: scaled polyline + stop dots.
function sparseMapSvg(points: [number, number][], stops: { lat: number; lon: number; name: string }[], W = 300, H = 170) {
  if (!points.length) return null
  const pad = 14
  const { minLat, maxLat, minLon, maxLon } = latLonBounds(points)
  const dLat = maxLat - minLat || 0.001
  const dLon = maxLon - minLon || 0.001
  const scale = Math.min((W - 2 * pad) / dLon, (H - 2 * pad) / dLat)
  const offX = (W - 2 * pad - dLon * scale) / 2
  const offY = (H - 2 * pad - dLat * scale) / 2
  const toX = (lon: number) => pad + offX + (lon  - minLon) * scale
  const toY = (lat: number) => H - pad - offY - (lat - minLat) * scale
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p[1]).toFixed(1)},${toY(p[0]).toFixed(1)}`).join(' ')
  const dots = stops.map(s => ({ x: toX(s.lon).toFixed(1), y: toY(s.lat).toFixed(1), name: s.name }))
  return { path, dots, W, H }
}

async function loadQuality() {
  qualityLoading.value = true
  const results = await Promise.all(CITIES.map(async (city) => {
    try {
      const routes = await loadCityRoutes(city.slug)
      let sparse = 0
      const items = []
      for (const route of routes) {
        for (const dir of route.directions ?? []) {
          const pts = dir.points ?? []
          const stops = dir.stops ?? []
          let distKm = 0
          if (stops.length >= 2) {
            const f = stops[0], l = stops[stops.length - 1]
            distKm = haversineKm(f.lat, f.lon, l.lat, l.lon)
          } else if (pts.length >= 2) {
            const f = pts[0], l = pts[pts.length - 1]
            distKm = haversineKm(f[0], f[1], l[0], l[1])
          }
          const ptsPerKm = distKm > 0.2 ? pts.length / distKm : Infinity
          const isSparse = pts.length < 10 || (distKm > 0.5 && ptsPerKm < 3)
          if (isSparse) {
            sparse++
            items.push({
              key:    `${city.slug}-${route.shortName}-${dir.headsign}`,
              line:   route.shortName,
              dir:    dir.headsign,
              pts:    pts.length,
              distKm: distKm.toFixed(2),
              reason: pts.length < 10 ? `Only ${pts.length} points` : `${ptsPerKm.toFixed(1)} pts/km`,
              points: pts,
              stops,
            })
          }
        }
      }
      return { slug: city.slug, name: city.displayName, total: routes.length, sparse, items }
    } catch {
      return { slug: city.slug, name: city.displayName, total: 0, sparse: 0, items: [], error: true }
    }
  }))
  qualityData.value  = results
  qualityLoading.value = false
}

onMounted(loadQuality)
</script>

<template>
  <div class="section">
    <div v-if="qualityLoading" class="admin-state">Loading route data…</div>
    <div v-else>
      <div v-for="city in qualityData" :key="city.slug" class="quality-city">
        <div class="quality-city-header">
          <span class="city-name">{{ city.name }}</span>
          <span v-if="city.error" class="admin-state error">Failed to load</span>
          <template v-else>
            <span class="quality-stat">{{ city.sparse }} of {{ city.total }} lines with sparse shapes</span>
            <span :class="['quality-pct', city.sparse > 0 ? 'warn' : 'ok']">
              {{ city.total > 0 ? Math.round((1 - city.sparse / city.total) * 100) : 100 }}% OK
            </span>
          </template>
        </div>
        <div v-if="city.items?.length">
          <div
            v-for="item in city.items"
            :key="item.key"
            class="sparse-item"
          >
            <div class="sparse-row" @click="expandedQualityKey = expandedQualityKey === item.key ? null : item.key">
              <span class="sparse-line">{{ item.line }}</span>
              <span class="cell-muted sparse-dir">{{ item.dir }}</span>
              <span class="sparse-pts">{{ item.pts }} pts</span>
              <span class="sparse-dist">{{ item.distKm }} km</span>
              <span class="cell-warn">{{ item.reason }}</span>
              <span class="sparse-toggle">{{ expandedQualityKey === item.key ? '▲' : '▼' }}</span>
            </div>
            <div v-if="expandedQualityKey === item.key" class="sparse-map-wrap">
              <template v-if="item.points.length">
                <template v-for="svg in [sparseMapSvg(item.points, item.stops)]" :key="0">
                  <svg v-if="svg" :width="svg.W" :height="svg.H" class="sparse-svg">
                    <polyline :points="svg.path" fill="none" stroke="var(--color-accent)" stroke-width="2" stroke-linejoin="round" />
                    <circle
                      v-for="(dot, i) in svg.dots"
                      :key="i"
                      :cx="dot.x"
                      :cy="dot.y"
                      r="3"
                      fill="var(--color-surface)"
                      stroke="var(--color-accent)"
                      stroke-width="1.5"
                    >
                      <title>{{ dot.name }}</title>
                    </circle>
                  </svg>
                </template>
              </template>
              <p v-else class="admin-state">No points to display.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quality-city {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
}

.quality-city-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.city-name {
  font: var(--text-body);
  font-weight: 800;
  color: var(--color-text);
}

.quality-stat {
  font: var(--text-caption);
  color: var(--color-muted);
}

.quality-pct.ok   { font: 700 12px var(--font-ui); color: var(--color-good-text); }
.quality-pct.warn { font: 700 12px var(--font-ui); color: var(--color-low-text); }

.cell-muted { color: var(--color-muted); }
.cell-warn  { color: var(--color-low-text); font-weight: 700; font: var(--text-caption); }

.sparse-item {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-icon);
  overflow: hidden;
  margin-bottom: 6px;
}

.sparse-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  cursor: pointer;
  flex-wrap: wrap;
}

.sparse-line  { font: 700 13px var(--font-ui); color: var(--color-text); flex: none; }
.sparse-dir   { font: 600 12px var(--font-ui); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sparse-pts   { font: var(--text-caption-sm); color: var(--color-muted); flex: none; }
.sparse-dist  { font: var(--text-caption-sm); color: var(--color-muted); flex: none; }
.sparse-toggle { font: 600 10px var(--font-ui); color: var(--color-muted); flex: none; margin-left: auto; }

.sparse-map-wrap {
  border-top: 1px solid var(--color-border);
  padding: 12px;
  background: var(--color-app-bg);
  display: flex;
  justify-content: center;
}

.sparse-svg {
  border-radius: var(--radius-sm);
  background: var(--color-field);
  display: block;
  max-width: 100%;
}
</style>
