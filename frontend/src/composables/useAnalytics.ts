import { customization } from '@/customization'

/**
 * Thin wrapper around Umami's window.umami.track(), fanned out to a
 * deployment-owned extra sink if custom/index.ts declares one (see
 * frontend/src/customization/contract.ts). Safe to call when Umami is
 * blocked by an ad-blocker or hasn't loaded yet (window.umami will be
 * undefined) — the call silently no-ops.
 *
 * A plain function (not a composable): it exposes no reactive state, so
 * there is nothing to bind to a component instance.
 */
export function track(eventName: string, data?: Record<string, unknown>): void {
  try {
    window.umami?.track(eventName, data)
  } catch {
    // Never let analytics errors affect the user experience.
  }
  try {
    customization.analytics?.track(eventName, data)
  } catch {
    // Never let analytics errors affect the user experience.
  }
}
