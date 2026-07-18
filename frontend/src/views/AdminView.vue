<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { pbAdminAuth, pbIsAuthenticated, pbVerifyAuth, pbLogout } from '@/services/pocketbaseClient'
import { APP_NAME } from '@/services/appConfig'
import AdminReportsTab from '@/components/admin/AdminReportsTab.vue'
import AdminQualityTab from '@/components/admin/AdminQualityTab.vue'
import AdminSyncTab from '@/components/admin/AdminSyncTab.vue'
import AdminSummaryTab from '@/components/admin/AdminSummaryTab.vue'
import AdminHealthTab from '@/components/admin/AdminHealthTab.vue'
import type { ReportStats } from '@/components/admin/AdminReportsTab.vue'

const ANALYTICS_URL = import.meta.env.VITE_ANALYTICS_URL ?? ''

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

onMounted(async () => {
  if (!authed.value) return
  const valid = await pbVerifyAuth()
  if (!valid) authed.value = false
})

// ── Tabs ────────────────────────────────────────────────────────────────────
// Each tab is its own component (components/admin/) that loads its data on
// mount. v-show (not v-if) keeps them all mounted, so everything loads
// eagerly right after login and switching tabs is instant.

const TABS = ['reports', 'quality', 'sync', 'summary', 'health', 'analytics']
const activeTab = ref('reports')

// Cross-tab aggregates: reports live in AdminReportsTab (authenticated
// collection, fetched once there) but feed the tab badge here and the
// per-city pending counts in AdminSummaryTab; health failures feed the
// "!" badge on the Health tab.
const reportStats = ref<ReportStats>({ newCount: 0, pendingByCity: {} })
const healthAlert = ref(false)
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
            <span v-if="reportStats.newCount" class="tab-badge">{{ reportStats.newCount }}</span>
          </span>
          <span v-else-if="tab === 'quality'">Quality</span>
          <span v-else-if="tab === 'sync'">OSM sync</span>
          <span v-else-if="tab === 'summary'">Summary</span>
          <span v-else-if="tab === 'health'">
            Health
            <span v-if="healthAlert" class="tab-badge">!</span>
          </span>
          <span v-else-if="tab === 'analytics'">Analytics</span>
        </button>
      </div>
      </div>

      <div class="admin-content">
        <AdminReportsTab
          v-show="activeTab === 'reports'"
          @stats="reportStats = $event"
          @session-expired="authed = false"
        />
        <AdminQualityTab v-show="activeTab === 'quality'" />
        <AdminSyncTab v-show="activeTab === 'sync'" />
        <AdminSummaryTab v-show="activeTab === 'summary'" :pending-by-city="reportStats.pendingByCity" />
        <AdminHealthTab v-show="activeTab === 'health'" @alert="healthAlert = $event" />

        <div v-show="activeTab === 'analytics'" class="analytics-section">
          <div class="analytics-actions">
            <a :href="ANALYTICS_URL" target="_blank" rel="noopener" class="admin-btn small">↗ Open Umami Analytics</a>
          </div>
          <p class="analytics-note">The analytics dashboard opens in a separate tab for security reasons.</p>
        </div>
      </div>
    </template>
  </div>
</template>

<!-- Shared admin primitives used by every tab component. Unscoped on
     purpose (scoped parent styles can't reach into child components);
     all class names are admin-prefixed to avoid collisions with app CSS. -->
<style>
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

.admin-btn.danger {
  background: var(--color-danger-bg);
  border-color: var(--color-danger-bg);
  color: var(--color-danger-text);
}

.admin-state {
  font: var(--text-label);
  color: var(--color-muted);
  padding: 8px 0;
}

.admin-state.error {
  color: var(--color-danger-text);
}

/* Root layout every tab component's template wraps itself in. */
.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>

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

/* ── Analytics ── */
.analytics-section { height: 100%; }

.analytics-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 10px;
}
</style>
