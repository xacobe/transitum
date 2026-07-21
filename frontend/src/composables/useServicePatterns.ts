import { ref, computed } from 'vue'
import { useCityStore } from '@/stores/city'
import type { PatternsManifest } from '@/types'

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Lazy access to the active city's patterns.json (weekday service-pattern
 * manifest, see pipeline/generate_transit_data.mjs) - used by advanced
 * search to bound the date picker and flag dates with a known
 * calendar_dates.txt exception. Not a singleton: each screen that needs it
 * gets its own small fetch, which is cheap and avoids stale cross-screen
 * state if the active city changes between mounts.
 */
export function useServicePatterns() {
  const cityStore = useCityStore()
  const patterns = ref<PatternsManifest | null>(null)

  async function ensureLoaded(): Promise<void> {
    if (patterns.value) return
    try {
      const resp = await fetch(`/data/${cityStore.activeSlug}/patterns.json`)
      if (resp.ok) patterns.value = await resp.json() as PatternsManifest
    } catch { /* offline or unavailable — callers fall back to generic bounds */ }
  }

  const dateMin = todayIso() // no historical schedules
  const dateMax = computed(() => {
    if (patterns.value?.validUntil) return patterns.value.validUntil
    const d = new Date()
    d.setDate(d.getDate() + 90)
    return d.toISOString().slice(0, 10)
  })

  function needsConnection(dateStr: string): boolean {
    return !!dateStr && !!patterns.value?.exceptionDates.includes(dateStr)
  }

  return { patterns, ensureLoaded, dateMin, dateMax, needsConnection }
}
