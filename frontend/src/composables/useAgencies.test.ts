import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import type { Agency } from '@/types'

const fakeCity = vi.hoisted(() => ({ agencies: [] as Agency[] }))

vi.mock('@/stores/city', () => ({
  useCityStore: () => ({ activeCity: fakeCity }),
}))

import { useAgencies, lineKey, routeIdentity, agencyIdFromGtfsId } from './useAgencies'

describe('lineKey', () => {
  it('joins agencyId and shortName', () => {
    expect(lineKey('BILBOBUS', '23')).toBe('BILBOBUS::23')
  })

  it('treats null/undefined agencyId as empty', () => {
    expect(lineKey(null, '23')).toBe('::23')
    expect(lineKey(undefined, '23')).toBe('::23')
  })
})

describe('routeIdentity', () => {
  it('prefers the route id when present', () => {
    expect(routeIdentity({ id: 'r1', agencyId: 'A', shortName: '23' } as never)).toBe('r1')
  })

  it('falls back to lineKey when id is absent', () => {
    expect(routeIdentity({ agencyId: 'A', shortName: '23' } as never)).toBe('A::23')
  })
})

describe('agencyIdFromGtfsId', () => {
  it('strips the feed prefix before the first colon', () => {
    expect(agencyIdFromGtfsId('bilbao:BILBOBUS')).toBe('BILBOBUS')
  })

  it('handles an id with no colon by returning it unchanged', () => {
    expect(agencyIdFromGtfsId('BILBOBUS')).toBe('BILBOBUS')
  })

  it('returns null for null/undefined input', () => {
    expect(agencyIdFromGtfsId(null)).toBeNull()
    expect(agencyIdFromGtfsId(undefined)).toBeNull()
  })
})

describe('useAgencies', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    fakeCity.agencies = []
  })

  it('hasMultipleAgencies is false for a single-agency city', () => {
    fakeCity.agencies = [{ agencyId: 'A', agencyName: 'A', agencyUrl: '', agencyTimezone: '', agencyLang: '' }] as Agency[]
    const { hasMultipleAgencies } = useAgencies()
    expect(hasMultipleAgencies.value).toBe(false)
  })

  it('hasMultipleAgencies is true once a city has more than one', () => {
    fakeCity.agencies = [
      { agencyId: 'A', agencyName: 'A', agencyUrl: '', agencyTimezone: '', agencyLang: '' },
      { agencyId: 'B', agencyName: 'B', agencyUrl: '', agencyTimezone: '', agencyLang: '' },
    ] as Agency[]
    const { hasMultipleAgencies } = useAgencies()
    expect(hasMultipleAgencies.value).toBe(true)
  })

  it('agencyFor finds by agencyId, or returns null', () => {
    fakeCity.agencies = [{ agencyId: 'A', agencyName: 'Agency A', agencyUrl: '', agencyTimezone: '', agencyLang: '' }] as Agency[]
    const { agencyFor } = useAgencies()
    expect(agencyFor('A')?.agencyName).toBe('Agency A')
    expect(agencyFor('missing')).toBeNull()
  })
})
