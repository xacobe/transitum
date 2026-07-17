import { computed } from 'vue'
import { useCityStore } from '@/stores/city'
import type { Schedule, FrequencyPeriod } from '@/types'

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function toMinutes(hhmmss: string): number {
  const [h, m] = hhmmss.split(':').map(Number)
  return h * 60 + m
}

// "05:30:00" -> "05:30"
function toLabel(hhmmss: string): string {
  return hhmmss.slice(0, 5)
}

// Shared by useFrequency's own city-wide periodAt and by any per-line
// FrequencyPeriod[] (see RouteDirection.frequencyPeriods) - same band shape,
// same "which period contains this moment" lookup either way.
export function findPeriodAt(periods: FrequencyPeriod[], date = new Date()): FrequencyPeriod | null {
  const minutes = minutesSinceMidnight(date)
  return periods.find((p) => minutes >= toMinutes(p.start) && minutes < toMinutes(p.end)) ?? null
}

export function useFrequency() {
  const city = useCityStore()
  const schedule = computed<Schedule>(() => city.activeCity.schedule)

  const serviceStartMinutes = computed(() => toMinutes(schedule.value.serviceStart))
  const serviceEndMinutes = computed(() => toMinutes(schedule.value.serviceEnd))
  const serviceStartLabel = computed(() => toLabel(schedule.value.serviceStart))
  const serviceEndLabel = computed(() => toLabel(schedule.value.serviceEnd))

  function periodAt(date = new Date()): FrequencyPeriod | null {
    return findPeriodAt(schedule.value.frequencyPeriods, date)
  }

  const currentPeriod = computed(() => periodAt())
  const headwayMinutes = computed(() =>
    currentPeriod.value ? Math.round(currentPeriod.value.headwaySeconds / 60) : null,
  )
  const reliability = computed<'high' | 'medium' | 'low' | null>(
    () => currentPeriod.value?.reliability ?? null,
  )

  const peakHeadwayMinutes = computed(() => {
    const peak = schedule.value.frequencyPeriods.find((p) => p.reliability === 'high')
    return peak ? Math.round(peak.headwaySeconds / 60) : null
  })

  function isWithinServiceHours(date = new Date()): boolean {
    const minutes = minutesSinceMidnight(date)
    return minutes >= serviceStartMinutes.value && minutes < serviceEndMinutes.value
  }

  function nextServiceStart(now = new Date()): Date {
    if (isWithinServiceHours(now)) return now
    const start = new Date(now)
    start.setHours(Math.floor(serviceStartMinutes.value / 60), serviceStartMinutes.value % 60, 0, 0)
    if (minutesSinceMidnight(now) >= serviceEndMinutes.value) {
      start.setDate(start.getDate() + 1)
    }
    return start
  }

  return {
    headwayMinutes,
    reliability,
    peakHeadwayMinutes,
    serviceStartLabel,
    serviceEndLabel,
    isWithinServiceHours,
    nextServiceStart,
    periodAt,
  }
}
