import { computed, toValue } from 'vue'
import type { ComputedRef, MaybeRefOrGetter } from 'vue'
import { useAgencies, agencyIdFromGtfsId } from '@/composables/useAgencies'
import { formatDuration, formatTime } from '@/services/format'
import type { Leg, BusLeg } from '@/types'

/**
 * Shared per-leg derived values for the two itinerary-leg renderers
 * (ItineraryLegRow.vue vertical layout, LegChip.vue horizontal chips): the
 * formatted ride duration, the boarding clock time (BUS legs only), the
 * leg's plain agencyId, and whether the active city has more than one
 * agency (so the operator name/badge is worth showing).
 */
export function useLeg(leg: MaybeRefOrGetter<Leg>): {
  duration: ComputedRef<string>
  departureTime: ComputedRef<string>
  agencyId: ComputedRef<string | undefined>
  hasMultipleAgencies: ComputedRef<boolean>
} {
  const { hasMultipleAgencies } = useAgencies()

  const duration = computed(() => formatDuration(toValue(leg).duration))

  const departureTime = computed(() => {
    const l = toValue(leg)
    return l.mode === 'BUS' ? formatTime((l as BusLeg).startTime) : ''
  })

  const agencyId = computed(() => {
    const l = toValue(leg)
    if (l.mode !== 'BUS') return undefined
    return agencyIdFromGtfsId((l as BusLeg).agency?.gtfsId) ?? undefined
  })

  return { duration, departureTime, agencyId, hasMultipleAgencies }
}
