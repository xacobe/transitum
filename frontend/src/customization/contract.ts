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

/** Every route name the framework itself defines (frontend/src/router/index.ts) - the keys `routePaths` can override. */
export type FrameworkRouteName =
  | 'home' | 'search' | 'mapResults' | 'stop'
  | 'list' | 'listSearch' | 'listResults'
  | 'lines' | 'line' | 'favorites' | 'settings' | 'help'
  | 'styleguide' | 'admin'

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
  /**
   * Overrides a framework route's URL path (route *names* never change, so
   * in-app navigation - which always goes through named routes - needs no
   * other changes). The framework's own paths are plain English
   * (`/map`, `/search`, `/stop/:stopId`, ...) regardless of VITE_DEFAULT_LOCALE
   * - there's no built-in translation to fall back to, so a deployment
   * whose primary language isn't English supplies its own strings here, the
   * same way `CustomNavItem.label` does for nav text. Keep any `:param`
   * segment the framework's own path has (see FrameworkRouteName's route
   * list) - e.g. `{ stop: '/arret/:stopId' }`, not `{ stop: '/arret' }`.
   */
  routePaths?: Partial<Record<FrameworkRouteName, string>>
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
