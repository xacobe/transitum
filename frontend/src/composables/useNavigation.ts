import { useRouter } from 'vue-router'
import { UNKNOWN_AGENCY } from '@/composables/useAgencies'

export function useNavigation() {
  const router = useRouter()

  function openStop(stopId: string) {
    router.push({ name: 'stop', params: { stopId } })
  }

  // agencyId disambiguates two different agencies reusing the same
  // shortName (see the router's own comment on the 'line' route) - falls
  // back to UNKNOWN_AGENCY when the caller doesn't have one (e.g. an old
  // favorite saved before agencies existed), which useRouteDetail matches
  // by shortName alone.
  function openLine(shortName: string, agencyId?: string | null) {
    router.push({ name: 'line', params: { agencyId: agencyId || UNKNOWN_AGENCY, shortName } })
  }

  /**
   * Navigates back if there is an in-app history entry to return to,
   * otherwise falls back: to the named route (string) or to a custom
   * navigation (function) for screens whose fallback depends on state.
   */
  function goBack(fallback: string | (() => void)) {
    if (window.history.state?.back) {
      router.back()
      return
    }
    if (typeof fallback === 'function') fallback()
    else router.push({ name: fallback })
  }

  return { openStop, openLine, goBack }
}
