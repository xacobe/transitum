import { useRouter } from 'vue-router'

export function useNavigation() {
  const router = useRouter()

  function openStop(stopId: string) {
    router.push({ name: 'stop', params: { stopId } })
  }

  function openLine(shortName: string) {
    router.push({ name: 'line', params: { shortName } })
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
