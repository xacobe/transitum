<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { pbAdminAuth, pbIsAuthenticated, pbVerifyAuth, pbLogout, pbGet, pbPatch, pbDelete } from '@/services/pocketbaseClient.js'
import { CITIES } from '@/cities'
import { haversineMeters } from '@/services/geo'
import { APP_NAME } from '@/services/appConfig'

const GITHUB_ACTIONS_URL = import.meta.env.VITE_REPOSITORY_URL
  ? `${import.meta.env.VITE_REPOSITORY_URL}/actions`
  : null
const ANALYTICS_URL = import.meta.env.VITE_ANALYTICS_URL ?? ''

interface Report {
  id: string
  city: string
  entity_type: string
  entity_id: string
  entity_name: string
  category: string
  description: string
  contact_email: string
  status: string
  created: string
}

interface QualityItem {
  key: string; line: string; dir: string; pts: number
  distKm: string; reason: string; points: [number, number][]; stops: { lat: number; lon: number; name: string }[]
}
interface QualityCity {
  slug: string; name: string; total: number; sparse: number; items: QualityItem[]; error?: boolean
}

interface HealthCheck {
  label: string; ok: boolean; status: number | null; ms: number | null
}

interface SummaryCity {
  slug: string; name: string; lines: number; stops: number; withShape: number; pendingReports: number; error?: boolean
}

// ── Auth ────────────────────────────────────────────────────────────────────

const authed    = ref(pbIsAuthenticated())
const authEmail = ref('')
const authPass  = ref('')
const authError = ref('')
const authBusy  = ref(false)

async function login() {
  authBusy.value  = true
  authError.value = ''
  try {
    await pbAdminAuth(authEmail.value, authPass.value)
    authed.value = true
    loadAll()
  } catch {
    authError.value = 'Invalid credentials.'
  } finally {
    authBusy.value = false
  }
}

function logout() {
  pbLogout()
  authed.value = false
}

// ── Tabs ────────────────────────────────────────────────────────────────────

const TABS = ['reports', 'quality', 'sync', 'summary', 'health', 'analytics']
const activeTab = ref('reports')

// ── Reports ─────────────────────────────────────────────────────────────────

const reports      = ref<Report[]>([])
const reportsLoading = ref(false)
const reportsError  = ref('')
const filterCity    = ref('')
const filterType    = ref('')
const filterStatus  = ref('')
const expandedId    = ref<string | null>(null)
const patchBusy     = ref(false)
const deleteBusy    = ref(false)

const STATUS_LABELS: Record<string, string>  = { new: 'New', reviewed: 'Reviewed', resolved: 'Resolved', wontfix: "Won't fix" }
const STATUS_COLORS: Record<string, string>  = { new: 'danger', reviewed: 'low', resolved: 'good', wontfix: 'muted' }
const TYPE_LABELS: Record<string, string>    = { stop: 'Stop', line: 'Line', route: 'Route', general: 'General' }
const CATEGORY_LABELS: Record<string, string> = {
  wrong_stop:     'Wrong information',
  route_changed:  'Route changed',
  wrong_schedule: 'Wrong schedule',
  other:          'Other',
}

async function loadReports() {
  reportsLoading.value = true
  reportsError.value   = ''
  try {
    const data = await pbGet('/collections/reports/records', {
      sort: '-created', perPage: '100',
    }) as { items?: Report[] }
    reports.value = data.items ?? []
  } catch (e) {
    if (!pbIsAuthenticated()) {
      authed.value = false
    } else {
      const err = e as { status?: number; message?: string }
      reportsError.value = `HTTP ${err.status ?? '?'}: ${err.message ?? ''}`
    }
  } finally {
    reportsLoading.value = false
  }
}

const filteredReports = computed(() => reports.value.filter(r => {
  if (filterCity.value   && r.city        !== filterCity.value)   return false
  if (filterType.value   && r.entity_type !== filterType.value)   return false
  if (filterStatus.value && r.status      !== filterStatus.value) return false
  return true
}))

function formatAdminDate(iso: string | null | undefined, fallback = ''): string {
  if (!iso) return fallback
  return new Date(iso).toLocaleString(navigator.language, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function deleteReport(report: Report) {
  const label = (report.entity_name || report.category).slice(0, 100)
  if (!confirm(`Delete the report for "${label}"? This action cannot be undone.`)) return
  deleteBusy.value = true
  try {
    await pbDelete(`/collections/reports/records/${report.id}`)
    reports.value = reports.value.filter(r => r.id !== report.id)
    expandedId.value = null
  } catch (e) {
    if (!pbIsAuthenticated()) {
      authed.value = false
    } else {
      alert('Failed to delete: ' + (e as Error).message)
    }
  } finally {
    deleteBusy.value = false
  }
}

async function patchStatus(report: Report, status: string) {
  patchBusy.value = true
  try {
    const updated = await pbPatch(`/collections/reports/records/${report.id}`, { status }) as Report
    const idx = reports.value.findIndex(r => r.id === report.id)
    if (idx !== -1) reports.value[idx] = updated
    expandedId.value = null
  } catch (e) {
    if (!pbIsAuthenticated()) {
      authed.value = false
    } else {
      alert('Failed to update status: ' + (e as Error).message)
    }
  } finally {
    patchBusy.value = false
  }
}

// ── Quality ──────────────────────────────────────────────────────────────────

const qualityData    = ref<QualityCity[]>([])
const qualityLoading = ref(false)

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return haversineMeters(lat1, lon1, lat2, lon2) / 1000
}

const expandedQualityKey = ref<string | null>(null)

function sparseMapSvg(points: [number, number][], stops: { lat: number; lon: number; name: string }[], W = 300, H = 170) {
  if (!points.length) return null
  const pad = 14
  const lats = points.map(p => p[0])
  const lons = points.map(p => p[1])
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLon = Math.min(...lons), maxLon = Math.max(...lons)
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
  const results = []
  for (const city of CITIES) {
    try {
      const res   = await fetch(`/data/${city.slug}/routes.json`)
      const routes = await res.json()
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
      results.push({ slug: city.slug, name: city.displayName, total: routes.length, sparse, items })
    } catch {
      results.push({ slug: city.slug, name: city.displayName, total: 0, sparse: 0, items: [], error: true })
    }
  }
  qualityData.value  = results
  qualityLoading.value = false
}

// ── Health check ─────────────────────────────────────────────────────────────

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
}

// ── Sync status ──────────────────────────────────────────────────────────────

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

// ── Summary ──────────────────────────────────────────────────────────────────

const summaryData    = ref<SummaryCity[]>([])
const summaryLoading = ref(false)

async function loadSummary() {
  summaryLoading.value = true
  const results: SummaryCity[] = []
  for (const city of CITIES) {
    try {
      const rr: { directions?: { points?: unknown[]; stops?: { id: string }[] }[] }[] = await fetch(`/data/${city.slug}/routes.json`).then(r => r.json())
      const withShape = rr.filter(r => r.directions?.some(d => (d.points?.length ?? 0) > 2)).length
      const stopIds = new Set()
      for (const route of rr) {
        for (const dir of route.directions ?? []) {
          for (const s of dir.stops ?? []) stopIds.add(s.id)
        }
      }
      const pendingReports = reports.value.filter(r => r.city === city.slug && (r.status === 'new' || r.status === 'reviewed')).length
      results.push({
        slug: city.slug, name: city.displayName,
        lines: rr.length, stops: stopIds.size, withShape, pendingReports,
      })
    } catch {
      results.push({ slug: city.slug, name: city.displayName, lines: 0, stops: 0, withShape: 0, pendingReports: 0, error: true })
    }
  }
  summaryData.value    = results
  summaryLoading.value = false
}

// ── Init ─────────────────────────────────────────────────────────────────────

function loadAll() {
  loadReports()
  loadQuality()
  loadSync()
  loadSummary()
  loadHealth()
}

onMounted(async () => {
  if (!authed.value) return
  const valid = await pbVerifyAuth()
  if (!valid) { authed.value = false; return }
  loadAll()
})
</script>

<template>
  <!-- Fixed overlay so BottomNav doesn't show through -->
  <div class="admin-shell">

    <!-- Login gate -->
    <div v-if="!authed" class="login-wrap">
      <div class="login-card">
        <div class="login-title">Admin panel</div>
        <form class="login-form" @submit.prevent="login">
          <input
            v-model="authEmail"
            type="email"
            class="admin-input"
            placeholder="Email"
            required
          />
          <input
            v-model="authPass"
            type="password"
            class="admin-input"
            placeholder="Password"
            required
          />
          <p v-if="authError" class="login-error">{{ authError }}</p>
          <button type="submit" class="admin-btn primary" :disabled="authBusy">
            {{ authBusy ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </div>
    </div>

    <!-- Admin panel -->
    <template v-else>
      <div class="admin-header">
        <span class="admin-brand">{{ APP_NAME }} Admin</span>
        <button type="button" class="admin-btn small" @click="logout">Log out</button>
      </div>

      <div class="tab-bar-wrap">
      <div class="tab-bar">
        <button
          v-for="tab in TABS"
          :key="tab"
          type="button"
          class="tab-btn"
          :class="{ active: activeTab === tab }"
          @click="activeTab = tab"
        >
          <span v-if="tab === 'reports'">Reports
            <span v-if="reports.filter(r => r.status === 'new').length" class="tab-badge">
              {{ reports.filter(r => r.status === 'new').length }}
            </span>
          </span>
          <span v-else-if="tab === 'quality'">Quality</span>
          <span v-else-if="tab === 'sync'">OSM sync</span>
          <span v-else-if="tab === 'summary'">Summary</span>
          <span v-else-if="tab === 'health'">
            Health
            <span v-if="healthData.some(h => !h.ok)" class="tab-badge">!</span>
          </span>
          <span v-else-if="tab === 'analytics'">Analytics</span>
        </button>
      </div>
      </div>

      <div class="admin-content">

        <!-- ── Reports ─────────────────────────────────────────────── -->
        <div v-if="activeTab === 'reports'" class="section">
          <div class="filter-bar">
            <select v-model="filterCity" class="admin-select">
              <option value="">All cities</option>
              <option v-for="c in CITIES" :key="c.slug" :value="c.slug">{{ c.displayName }}</option>
            </select>
            <select v-model="filterType" class="admin-select">
              <option value="">All types</option>
              <option value="stop">Stop</option>
              <option value="line">Line</option>
              <option value="general">General</option>
            </select>
            <select v-model="filterStatus" class="admin-select">
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="reviewed">Reviewed</option>
              <option value="resolved">Resolved</option>
              <option value="wontfix">Won't fix</option>
            </select>
            <button type="button" class="admin-btn small" @click="loadReports">↺ Refresh</button>
          </div>

          <div v-if="reportsLoading" class="state-text">Loading…</div>
          <div v-else-if="reportsError" class="state-text error">{{ reportsError }}</div>
          <div v-else-if="filteredReports.length === 0" class="state-text">No reports.</div>

          <div v-else class="reports-list">
            <div
              v-for="report in filteredReports"
              :key="report.id"
              class="report-row"
              :class="{ expanded: expandedId === report.id }"
            >
              <div class="report-summary" @click="expandedId = expandedId === report.id ? null : report.id">
                <span :class="['status-chip', STATUS_COLORS[report.status]]">{{ STATUS_LABELS[report.status] }}</span>
                <span class="report-city">{{ report.city }}</span>
                <span class="report-type">{{ TYPE_LABELS[report.entity_type] ?? report.entity_type }}</span>
                <span class="report-cat">{{ CATEGORY_LABELS[report.category] ?? report.category }}</span>
                <span class="report-name">{{ report.entity_name }}</span>
                <span class="report-date">{{ formatAdminDate(report.created) }}</span>
              </div>
              <div v-if="expandedId === report.id" class="report-detail">
                <p v-if="report.description" class="report-desc">{{ report.description }}</p>
                <p v-if="report.contact_email" class="report-email">📧 {{ report.contact_email }}</p>
                <div class="report-detail-footer">
                  <div class="status-actions">
                    <button
                      v-for="s in ['new', 'reviewed', 'resolved', 'wontfix']"
                      :key="s"
                      type="button"
                      :class="['admin-btn', 'small', report.status === s ? 'primary' : '']"
                      :disabled="patchBusy || deleteBusy || report.status === s"
                      @click="patchStatus(report, s)"
                    >
                      {{ STATUS_LABELS[s] }}
                    </button>
                  </div>
                  <button
                    type="button"
                    class="admin-btn small danger"
                    :disabled="deleteBusy || patchBusy"
                    @click="deleteReport(report)"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Quality ────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'quality'" class="section">
          <div v-if="qualityLoading" class="state-text">Loading route data…</div>
          <div v-else>
            <div v-for="city in qualityData" :key="city.slug" class="quality-city">
              <div class="quality-city-header">
                <span class="city-name">{{ city.name }}</span>
                <span v-if="city.error" class="state-text error">Failed to load</span>
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
                    <p v-else class="state-text">No points to display.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Sync ───────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'sync'" class="section">
          <div v-if="syncLoading" class="state-text">Loading…</div>
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
                  <td class="cell-muted">{{ formatAdminDate(syncData?.[city.slug], '—') }}</td>
                  <td :class="['cell-days', daysSince(syncData?.[city.slug]) > 7 ? 'cell-warn' : '']">
                    {{ daysSince(syncData?.[city.slug]) >= 0 ? daysSince(syncData?.[city.slug]) + ' days' : '?' }}
                  </td>
                  <td class="cell-muted">{{ formatAdminDate(versionData[city.slug]?.generatedAt, '—') }}</td>
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

        <!-- ── Summary ────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'summary'" class="section">
          <div v-if="summaryLoading" class="state-text">Loading…</div>
          <div v-else class="summary-grid">
            <div v-for="city in summaryData" :key="city.slug" class="summary-card">
              <div class="summary-city-name">{{ city.name }}</div>
              <div v-if="city.error" class="state-text error">Failed to load</div>
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
                  <span :class="['stat-value', city.pendingReports > 0 ? 'stat-warn' : '']">{{ city.pendingReports }}</span>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- ── Health ─────────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'health'" class="section">
          <button type="button" class="admin-btn small" style="align-self:flex-start" @click="loadHealth">↺ Check</button>
          <div v-if="healthLoading" class="state-text">Checking…</div>
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

        <!-- ── Analytics ──────────────────────────────────────────── -->
        <div v-else-if="activeTab === 'analytics'" class="section analytics-section">
          <div class="analytics-actions">
            <a :href="ANALYTICS_URL" target="_blank" rel="noopener" class="admin-btn small">↗ Open Umami Analytics</a>
          </div>
          <p class="analytics-note">The analytics dashboard opens in a separate tab for security reasons.</p>
        </div>

      </div>
    </template>
  </div>
</template>

<style scoped>
.admin-shell {
  position: fixed;
  inset: 0;
  background: var(--color-app-bg);
  display: flex;
  flex-direction: column;
  z-index: var(--z-sticky);
  font-family: var(--font-ui);
}

/* ── Login ── */
.login-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-search);
  padding: 28px 24px;
  width: 100%;
  max-width: 380px;
}

.login-title {
  font: var(--text-page-title);
  font-size: 20px;
  color: var(--color-text);
  margin-bottom: 20px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.login-error {
  font: var(--text-caption);
  color: var(--color-danger-text);
}

/* ── Header ── */
.admin-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-accent);
  flex: none;
}

.admin-brand {
  font: var(--text-heading-sm);
  color: var(--color-accent-text);
}

/* ── Tabs ── */
.tab-bar-wrap {
  position: relative;
  flex: none;
}
.tab-bar-wrap::after {
  content: '';
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 32px;
  background: linear-gradient(to right, transparent, var(--color-surface));
  pointer-events: none;
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  overflow-x: auto;
  scrollbar-width: none;
}
.tab-bar::-webkit-scrollbar { display: none; }

.tab-btn {
  padding: 12px 16px;
  font: var(--text-label-strong);
  color: var(--color-muted);
  white-space: nowrap;
  flex: none;
}

.tab-btn.active {
  color: var(--color-accent);
  border-bottom: 2px solid var(--color-accent);
}

.tab-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-danger-bg);
  color: var(--color-danger-text);
  font: 700 10px var(--font-ui);
  border-radius: var(--radius-icon);
  padding: 1px 5px;
  margin-left: 5px;
}

/* ── Content ── */
.admin-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  max-width: 900px;
  width: 100%;
  margin: 0 auto;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state-text {
  font: var(--text-label);
  color: var(--color-muted);
  padding: 8px 0;
}

.state-text.error {
  color: var(--color-danger-text);
}

/* ── Inputs & buttons ── */
.admin-input {
  background: var(--color-field);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font: var(--text-label);
  color: var(--color-text);
  width: 100%;
}

.admin-input:focus {
  outline: 2px solid var(--color-accent);
  outline-offset: 1px;
}

.admin-select {
  background: var(--color-field);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-icon);
  padding: 7px 10px;
  font: var(--text-caption);
  color: var(--color-text);
  appearance: none;
}

.admin-btn {
  background: var(--color-field);
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-icon);
  padding: 10px 16px;
  font: var(--text-label-strong);
  color: var(--color-text);
  cursor: pointer;
}

.admin-btn.primary {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: var(--color-accent-text);
}

.admin-btn.small {
  padding: 6px 12px;
  font-size: 12px;
}

.admin-btn:disabled {
  opacity: 0.45;
}

/* ── Reports ── */
.filter-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.reports-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.report-row {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.report-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  flex-wrap: wrap;
}

.report-row.expanded .report-summary {
  border-bottom: 1px solid var(--color-border);
}

.status-chip {
  font: var(--text-caption-sm);
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 6px;
  flex: none;
}

.status-chip.danger  { background: var(--color-danger-bg);  color: var(--color-danger-text); }
.status-chip.low     { background: var(--color-low-bg);     color: var(--color-low-text); }
.status-chip.good    { background: var(--color-good-bg);    color: var(--color-good-text); }
.status-chip.muted   { background: var(--color-chip-bg);    color: var(--color-chip-text); }

.report-city  { font: 700 12px var(--font-ui); color: var(--color-text); }
.report-type  { font: var(--text-caption-sm); color: var(--color-muted); background: var(--color-chip-bg); padding: 2px 6px; border-radius: 5px; }
.report-cat   { font: 600 12px var(--font-ui); color: var(--color-text); }
.report-name  { font: var(--text-caption-sm); color: var(--color-muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.report-date  { font: var(--text-caption-sm); color: var(--color-sub); flex: none; margin-left: auto; }

.report-detail {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.report-desc  { font: 400 13px var(--font-ui); color: var(--color-text); }
.report-email { font: 600 12px var(--font-ui); color: var(--color-muted); }

.report-detail-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.status-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.admin-btn.danger {
  background: var(--color-danger-bg);
  border-color: var(--color-danger-bg);
  color: var(--color-danger-text);
}

/* ── Quality ── */
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

/* ── Sync ── */
.gh-link {
  display: inline-block;
  margin-top: 12px;
  font: var(--text-label-strong);
  color: var(--color-accent);
  text-decoration: none;
}

/* ── Sparse quality rows ── */
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

/* ── Health ── */
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

/* ── Analytics ── */
.analytics-section { height: 100%; }

.analytics-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}


/* ── Summary ── */
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
