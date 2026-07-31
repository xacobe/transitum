import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { loadCityRoutes, loadCityRoutesMeta } from '@/services/cityData'
import { useCityStore } from '@/stores/city'
import { UNKNOWN_AGENCY } from '@/composables/useAgencies'
import type { Route } from '@/types'

/** All lines, already sorted (natural order by shortName). Recomputes
 * if the city is switched without reloading the app. */
export function useRoutesList() {
  const city = useCityStore()
  const routes = ref<Route[]>([])
  const loading = ref(true)

  watch(
    () => city.activeSlug,
    (slug) => {
      loading.value = true
      loadCityRoutes(slug).then((data) => {
        routes.value = data
        loading.value = false
      })
    },
    { immediate: true },
  )

  return { routes, loading }
}

/** Same shape as useRoutesList(), backed by routes-meta.json instead of the
 * full routes.json (no geometry, a fraction of the payload) - for callers
 * that only need per-route fields like `mode` (see useTransitModeFilter's
 * internal fallback) and would otherwise pull the full geometry across the
 * network for nothing. */
export function useRoutesMetaList() {
  const city = useCityStore()
  const routes = ref<Route[]>([])
  const loading = ref(true)

  watch(
    () => city.activeSlug,
    (slug) => {
      loading.value = true
      loadCityRoutesMeta(slug).then((data) => {
        routes.value = data
        loading.value = false
      })
    },
    { immediate: true },
  )

  return { routes, loading }
}

/** One line by (shortName, agencyId) - reactive to either ref or city
 * changes - or null. agencyId disambiguates two different agencies reusing
 * the same shortName (e.g. a bus line and a metro line both numbered "4");
 * UNKNOWN_AGENCY (see openLine()) falls back to shortName alone. */
export function useRouteDetail(shortNameRef: Ref<string>, agencyIdRef: Ref<string>) {
  const city = useCityStore()
  const route = ref<Route | null>(null)
  const loading = ref(true)

  watch(
    [shortNameRef, agencyIdRef, () => city.activeSlug],
    async ([shortName, agencyId, slug]) => {
      loading.value = true
      const data = await loadCityRoutes(slug)
      const knownAgencyId = agencyId && agencyId !== UNKNOWN_AGENCY ? agencyId : null
      route.value = data.find((r) =>
        r.shortName === shortName && (!knownAgencyId || r.agencyId === knownAgencyId),
      ) ?? null
      loading.value = false
    },
    { immediate: true },
  )

  return { route, loading }
}
