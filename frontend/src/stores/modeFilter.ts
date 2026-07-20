import { defineStore } from 'pinia'
import type { TransitMode } from '@/types'

export const useModeFilterStore = defineStore('modeFilter', {
  state: (): { activeModes: TransitMode[] | null; forCity: string | null } => ({
    // null = no filter (every mode allowed) - both the default and the state
    // after toggling every mode back on. When non-null, always a subset of
    // the active city's available modes - see useTransitModeFilter.
    activeModes: null,
    forCity: null,
  }),
  actions: {
    // Resets the filter whenever the active city changes, so a filter picked
    // in one city (e.g. "only metro") doesn't silently narrow a different
    // city that may not even have that mode.
    ensureCity(slug: string): void {
      if (this.forCity !== slug) {
        this.forCity = slug
        this.activeModes = null
      }
    },
    toggle(mode: TransitMode, available: TransitMode[]): void {
      const current = this.activeModes ?? available
      const next = current.includes(mode)
        ? current.filter((m) => m !== mode)
        : [...current, mode]
      // Deselecting the last mode or reselecting every mode both mean "no
      // filter" - collapse to null so callers only ever check one value.
      this.activeModes = (next.length === 0 || next.length === available.length) ? null : next
    },
  },
})
