import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Schedule, FrequencyPeriod } from '@/types'

const fakeSchedule = vi.hoisted(() => ({
  value: {
    serviceStart: '05:30:00',
    serviceEnd: '21:30:00',
    frequencyPeriods: [
      { start: '05:30:00', end: '07:00:00', headwaySeconds: 1800, reliability: 'medium' },
      { start: '07:00:00', end: '20:00:00', headwaySeconds: 600, reliability: 'high' },
      { start: '20:00:00', end: '21:30:00', headwaySeconds: 1800, reliability: 'low' },
    ] as FrequencyPeriod[],
  } satisfies Schedule,
}))

vi.mock('@/stores/city', () => ({
  useCityStore: () => ({ activeCity: { schedule: fakeSchedule.value } }),
}))

import { useFrequency, findPeriodAt } from './useFrequency'

function at(hh: number, mm: number): Date {
  return new Date(2026, 0, 1, hh, mm)
}

describe('findPeriodAt', () => {
  const periods: FrequencyPeriod[] = [
    { start: '05:30:00', end: '07:00:00', headwaySeconds: 1800, reliability: 'medium' },
    { start: '07:00:00', end: '20:00:00', headwaySeconds: 600, reliability: 'high' },
  ]

  it('returns the period containing the given moment', () => {
    expect(findPeriodAt(periods, at(8, 0))?.reliability).toBe('high')
    expect(findPeriodAt(periods, at(6, 0))?.reliability).toBe('medium')
  })

  it('is inclusive of a period start and exclusive of its end', () => {
    expect(findPeriodAt(periods, at(7, 0))?.reliability).toBe('high') // boundary belongs to the next period
    expect(findPeriodAt(periods, at(6, 59))?.reliability).toBe('medium')
  })

  it('returns null outside every period', () => {
    expect(findPeriodAt(periods, at(23, 0))).toBeNull()
  })
})

describe('useFrequency', () => {
  beforeEach(() => {
    fakeSchedule.value.serviceStart = '05:30:00'
    fakeSchedule.value.serviceEnd = '21:30:00'
  })

  it('isWithinServiceHours is true during service and false outside it', () => {
    const { isWithinServiceHours } = useFrequency()
    expect(isWithinServiceHours(at(12, 0))).toBe(true)
    expect(isWithinServiceHours(at(4, 0))).toBe(false)
    expect(isWithinServiceHours(at(22, 0))).toBe(false)
  })

  it('nextServiceStart returns "now" when already within service hours', () => {
    const { nextServiceStart } = useFrequency()
    const now = at(12, 0)
    expect(nextServiceStart(now)).toBe(now)
  })

  it('nextServiceStart rolls over to tomorrow when called after service ends', () => {
    const { nextServiceStart } = useFrequency()
    const now = at(23, 0)
    const next = nextServiceStart(now)
    expect(next.getDate()).toBe(now.getDate() + 1)
    expect(next.getHours()).toBe(5)
    expect(next.getMinutes()).toBe(30)
  })

  it('nextServiceStart stays on the same day when called before service starts', () => {
    const { nextServiceStart } = useFrequency()
    const now = at(4, 0)
    const next = nextServiceStart(now)
    expect(next.getDate()).toBe(now.getDate())
    expect(next.getHours()).toBe(5)
    expect(next.getMinutes()).toBe(30)
  })

  it('periodAt reflects the mocked schedule frequency periods', () => {
    const { periodAt } = useFrequency()
    expect(periodAt(at(8, 0))?.reliability).toBe('high')
  })
})
