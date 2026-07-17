import type { App, Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

export interface ReportPayload {
  city: string
  entity_type: 'stop' | 'line' | 'route' | 'general'
  entity_id?: string
  entity_name?: string
  category: 'wrong_stop' | 'route_changed' | 'wrong_schedule' | 'other'
  description?: string
  contact_email?: string
}

export interface CustomNavItem {
  /** Route path to link to, e.g. '/schedules'. */
  to: string
  /** Any Vue component; @tabler/icons-vue works out of the box (receives :size="22"). */
  icon: Component
  /** Plain string, or a per-locale map matching this deployment's locales: { fr: 'Horaires', en: 'Schedules' }. */
  label: string | Record<string, string>
  /** Route names that highlight this item as active; defaults to an exact match on `to`. */
  activeRouteNames?: string[]
}

export interface DeploymentCustomization {
  /**
   * Contract version. Bumped only on breaking changes to this interface -
   * a mismatch after `git merge upstream/main` fails typecheck loudly
   * instead of breaking silently at runtime.
   */
  version: 1
  /** Appended after the framework's own routes. Use lazy components (`() => import(...)`) - this module is eagerly bundled into the entry chunk. */
  routes?: RouteRecordRaw[]
  /** Appended after the framework's 4 bottom-nav items. One extra item fits comfortably; more gets cramped on narrow screens. */
  navItems?: CustomNavItem[]
  /** Runs once, after Pinia/router/i18n are installed and before the framework's own stores are initialized. Register extra Pinia stores, plugins, or i18n messages here. Must be synchronous. */
  install?: (app: App) => void
  /** Additional analytics sink, called alongside Umami (if configured) on every track() call. To fully replace Umami, also leave VITE_ANALYTICS_URL/VITE_ANALYTICS_WEBSITE_ID empty. */
  analytics?: { track(eventName: string, data?: Record<string, unknown>): void }
  /** Replaces the default PocketBase report submitter. Throw to signal failure - the framework keeps ownership of the submitting/submitted/error UI state around this call. */
  submitReport?: (payload: ReportPayload) => Promise<void>
}

/** Identity helper - exists only to give `custom/index.ts` contextual typing/autocomplete without spelling out DeploymentCustomization by hand. */
export function defineCustomization(c: DeploymentCustomization): DeploymentCustomization {
  return c
}
