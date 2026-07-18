<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { pbIsAuthenticated, pbGet, pbPatch, pbDelete } from '@/services/pocketbaseClient'
import { CITIES } from '@/cities'
import { formatDateTime } from '@/services/format'

export interface Report {
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

/** Aggregates the parent needs outside this tab (tab badge, summary tab). */
export interface ReportStats {
  newCount: number
  pendingByCity: Record<string, number>
}

const emit = defineEmits<{
  /** PocketBase auth token no longer valid - parent shows the login gate. */
  'session-expired': []
  /** Re-emitted after every load/patch/delete so parent aggregates stay fresh. */
  stats: [stats: ReportStats]
}>()

const reports        = ref<Report[]>([])
const reportsLoading = ref(false)
const reportsError   = ref('')
const filterCity     = ref('')
const filterType     = ref('')
const filterStatus   = ref('')
const expandedId     = ref<string | null>(null)
const patchBusy      = ref(false)
const deleteBusy     = ref(false)

const STATUS_LABELS: Record<string, string>  = { new: 'New', reviewed: 'Reviewed', resolved: 'Resolved', wontfix: "Won't fix" }
const STATUS_COLORS: Record<string, string>  = { new: 'danger', reviewed: 'low', resolved: 'good', wontfix: 'muted' }
const TYPE_LABELS: Record<string, string>    = { stop: 'Stop', line: 'Line', route: 'Route', general: 'General' }
const CATEGORY_LABELS: Record<string, string> = {
  wrong_stop:     'Wrong information',
  route_changed:  'Route changed',
  wrong_schedule: 'Wrong schedule',
  other:          'Other',
}

function emitStats() {
  const pendingByCity: Record<string, number> = {}
  let newCount = 0
  for (const r of reports.value) {
    if (r.status === 'new') newCount++
    if (r.status === 'new' || r.status === 'reviewed') {
      pendingByCity[r.city] = (pendingByCity[r.city] ?? 0) + 1
    }
  }
  emit('stats', { newCount, pendingByCity })
}

async function loadReports() {
  reportsLoading.value = true
  reportsError.value   = ''
  try {
    const data = await pbGet('/collections/reports/records', {
      sort: '-created', perPage: '100',
    }) as { items?: Report[] }
    reports.value = data.items ?? []
    emitStats()
  } catch (e) {
    if (!pbIsAuthenticated()) {
      emit('session-expired')
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

async function deleteReport(report: Report) {
  const label = (report.entity_name || report.category).slice(0, 100)
  if (!confirm(`Delete the report for "${label}"? This action cannot be undone.`)) return
  deleteBusy.value = true
  try {
    await pbDelete(`/collections/reports/records/${report.id}`)
    reports.value = reports.value.filter(r => r.id !== report.id)
    expandedId.value = null
    emitStats()
  } catch (e) {
    if (!pbIsAuthenticated()) {
      emit('session-expired')
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
    emitStats()
  } catch (e) {
    if (!pbIsAuthenticated()) {
      emit('session-expired')
    } else {
      alert('Failed to update status: ' + (e as Error).message)
    }
  } finally {
    patchBusy.value = false
  }
}

onMounted(loadReports)
</script>

<template>
  <div class="section">
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

    <div v-if="reportsLoading" class="admin-state">Loading…</div>
    <div v-else-if="reportsError" class="admin-state error">{{ reportsError }}</div>
    <div v-else-if="filteredReports.length === 0" class="admin-state">No reports.</div>

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
          <span class="report-date">{{ formatDateTime(report.created) }}</span>
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
</template>

<style scoped>
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
</style>
