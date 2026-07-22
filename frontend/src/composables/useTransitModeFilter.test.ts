import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref } from 'vue'
import type { Route, Stop } from '@/types'

vi.mock('@/stores/city', () => ({
  useCityStore: () => ({ activeSlug: 'bilbao' }),
}))

import { useTransitModeFilter } from './useTransitModeFilter'

function route(mode: Route['mode']): Route {
  return { mode } as Route
}

describe('useTransitModeFilter', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('availableModes lists only modes present in the routes, in the fixed display order', () => {
    const routes = ref<Route[]>([route('tram'), route('bus'), route('metro')])
    const { availableModes } = useTransitModeFilter(routes)
    expect(availableModes.value).toEqual(['bus', 'metro', 'tram'])
  })

  it('routes with no mode fall back to bus for availableModes purposes', () => {
    const routes = ref<Route[]>([route(undefined)])
    const { availableModes } = useTransitModeFilter(routes)
    expect(availableModes.value).toEqual(['bus'])
  })

  it('showFilter is false for a single-mode city and true once there are 2+', () => {
    const single = useTransitModeFilter(ref<Route[]>([route('bus')]))
    expect(single.showFilter.value).toBe(false)

    const multi = useTransitModeFilter(ref<Route[]>([route('bus'), route('metro')]))
    expect(multi.showFilter.value).toBe(true)
  })

  it('with no filter active, isActive is true for every available mode', () => {
    const routes = ref<Route[]>([route('bus'), route('metro')])
    const { isActive } = useTransitModeFilter(routes)
    expect(isActive('bus')).toBe(true)
    expect(isActive('metro')).toBe(true)
  })

  it('toggle narrows the active set, and matchesFilter/matchesStopFilter follow it', () => {
    const routes = ref<Route[]>([route('bus'), route('metro'), route('tram')])
    const { toggle, isActive, matchesFilter, matchesStopFilter } = useTransitModeFilter(routes)

    toggle('bus') // deselect bus, leaving metro+tram active
    expect(isActive('bus')).toBe(false)
    expect(isActive('metro')).toBe(true)
    expect(matchesFilter(route('bus'))).toBe(false)
    expect(matchesFilter(route('metro'))).toBe(true)

    // A multi-mode stop stays visible if ANY of its modes is still active.
    expect(matchesStopFilter({ modes: ['bus', 'metro'] } as Pick<Stop, 'modes'>)).toBe(true)
    expect(matchesStopFilter({ modes: ['bus'] } as Pick<Stop, 'modes'>)).toBe(false)
    // A stop with no modes falls back to "bus".
    expect(matchesStopFilter({} as Pick<Stop, 'modes'>)).toBe(false)
  })

  it('toggling every mode back on collapses the filter to unfiltered (null-equivalent)', () => {
    const routes = ref<Route[]>([route('bus'), route('metro')])
    const { toggle, isActive, transportModesParam } = useTransitModeFilter(routes)

    toggle('bus')
    toggle('bus') // back to both active
    expect(isActive('bus')).toBe(true)
    expect(isActive('metro')).toBe(true)
    // Unfiltered means "no restriction" downstream (fetchPlan/findOfflineRoutes).
    expect(transportModesParam.value).toBeNull()
  })

  it('transportModesParam is null when the filter bar would not even show (single mode)', () => {
    const routes = ref<Route[]>([route('bus')])
    const { transportModesParam } = useTransitModeFilter(routes)
    expect(transportModesParam.value).toBeNull()
  })
})
