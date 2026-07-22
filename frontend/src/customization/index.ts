import type { DeploymentCustomization } from './contract'

export { defineCustomization } from './contract'
export type { DeploymentCustomization, CustomNavItem, ReportPayload, FrameworkRouteName } from './contract'

// Matches frontend/src/custom/index.ts if this deployment has one; matches
// nothing (not an error) otherwise. Eager: resolved at build time so route
// registration in router/index.ts stays synchronous, and Vite watches the
// pattern in dev - creating custom/index.ts hot-applies without a restart.
// Because it's a real file under src/, it's part of the vue-tsc/IDE module
// graph (unlike a virtual module), and lands in the entry chunk - keep any
// route components inside it lazy (`() => import(...)`).
const matches = import.meta.glob<{ default: DeploymentCustomization }>(
  '../custom/index.ts',
  { eager: true },
)
const loaded = matches['../custom/index.ts']?.default

if (import.meta.env.DEV && loaded) {
  if (loaded.version !== 1) {
    console.error(`[customization] unsupported contract version ${loaded.version} - see frontend/src/customization/contract.ts`)
  }
  if ((loaded.navItems?.length ?? 0) > 1) {
    console.warn('[customization] more than 1 custom bottom-nav item gets cramped on narrow screens')
  }
}

export const customization = {
  routes: loaded?.routes ?? [],
  routePaths: loaded?.routePaths ?? {},
  navItems: loaded?.navItems ?? [],
  install: loaded?.install,
  analytics: loaded?.analytics,
  submitReport: loaded?.submitReport,
}
