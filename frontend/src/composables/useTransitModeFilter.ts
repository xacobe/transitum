import { computed, watch } from 'vue'
import type { Ref } from 'vue'
import { useModeFilterStore } from '@/stores/modeFilter'
import { useCityStore } from '@/stores/city'
import { useRoutesList } from '@/composables/useLocalRoutes'
import type { Route, Stop, TransitMode } from '@/types'

// Fixed display order - bus, metro, tram, rail first (the modes most
// cities actually mix), rarer ones after.
const MODE_ORDER: TransitMode[] = [
  'bus', 'metro', 'tram', 'rail',
  'monorail', 'cable_tram', 'aerial_lift', 'funicular', 'ferry', 'trolleybus',
]

/**
 * Shared transit-mode filter: which modes exist in the active city's network
 * and which of them are currently active. Backed by a Pinia store so the
 * same selection applies everywhere it's used (Lines browser, route-planning
 * results) without threading state through props.
 *
 * @param routesRef - reuse an already-loaded routes list (e.g. LinesView's
 *   own useRoutesList()) to avoid a second fetch; omit to load one internally.
 */
export function useTransitModeFilter(routesRef?: Ref<Route[]>) {
  const city = useCityStore()
  const store = useModeFilterStore()
  const { routes } = routesRef ? { routes: routesRef } : useRoutesList()

  watch(() => city.activeSlug, (slug) => store.ensureCity(slug), { immediate: true })

  const availableModes = computed<TransitMode[]>(() => {
    const present = new Set(routes.value.map((r) => r.mode ?? 'bus'))
    return MODE_ORDER.filter((m) => present.has(m))
  })

  // Only worth showing the filter when a city actually has more than one
  // mode - e.g. a bus-only city would just get noise buttons. Also false
  // while routes haven't loaded yet, which conveniently keeps
  // transportModesParam unrestricted during that window.
  const showFilter = computed(() => availableModes.value.length > 1)

  const activeModes = computed<TransitMode[]>(() => store.activeModes ?? availableModes.value)

  function isActive(mode: TransitMode): boolean {
    return activeModes.value.includes(mode)
  }

  function toggle(mode: TransitMode): void {
    store.toggle(mode, availableModes.value)
  }

  function matchesFilter(route: Route): boolean {
    return activeModes.value.includes(route.mode ?? 'bus')
  }

  // A stop can serve several modes at once (see Stop.modes) - it stays
  // visible as long as at least one of them is active, not only when every
  // one of them is. Missing/empty modes falls back to 'bus', same
  // convention as matchesFilter/Route.mode.
  function matchesStopFilter(stop: Pick<Stop, 'modes'>): boolean {
    const modes = stop.modes?.length ? stop.modes : (['bus'] as TransitMode[])
    return modes.some((m) => activeModes.value.includes(m))
  }

  // null when unfiltered - callers pass this straight through to
  // fetchPlan/findOfflineRoutes, which treat null as "no restriction"
  // (see routeTypesForModes in services/routing/minotorHelpers.js).
  const transportModesParam = computed<TransitMode[] | null>(() =>
    showFilter.value ? store.activeModes : null,
  )

  return {
    availableModes, showFilter, activeModes, isActive, toggle,
    matchesFilter, matchesStopFilter, transportModesParam,
  }
}
