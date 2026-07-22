import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useModeFilterStore } from './modeFilter'

describe('useModeFilterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts unfiltered', () => {
    const store = useModeFilterStore()
    expect(store.activeModes).toBeNull()
  })

  it('ensureCity resets the filter when the city changes', () => {
    const store = useModeFilterStore()
    store.ensureCity('bilbao') // establish the initial city, as the real watch(..., {immediate:true}) does
    store.toggle('bus', ['bus', 'metro'])
    expect(store.activeModes).toEqual(['metro'])

    store.ensureCity('bilbao')
    expect(store.activeModes).toEqual(['metro']) // same city again - unchanged

    store.ensureCity('ouagadougou')
    expect(store.activeModes).toBeNull() // different city - filter resets
  })

  it('ensureCity is a no-op when the city has not actually changed', () => {
    const store = useModeFilterStore()
    store.ensureCity('bilbao')
    store.toggle('bus', ['bus', 'metro'])
    store.ensureCity('bilbao')
    expect(store.activeModes).toEqual(['metro'])
  })

  it('toggle removes a mode from the active set', () => {
    const store = useModeFilterStore()
    store.toggle('bus', ['bus', 'metro', 'tram'])
    expect(store.activeModes).toEqual(['metro', 'tram'])
  })

  it('toggle re-adds a previously removed mode', () => {
    const store = useModeFilterStore()
    store.toggle('bus', ['bus', 'metro'])
    store.toggle('bus', ['bus', 'metro'])
    expect(store.activeModes).toBeNull() // back to every mode -> collapses to "unfiltered"
  })

  it('deselecting the only active mode collapses to unfiltered rather than an empty array', () => {
    const store = useModeFilterStore()
    store.toggle('bus', ['bus', 'metro'])
    store.toggle('metro', ['bus', 'metro'])
    expect(store.activeModes).toBeNull()
  })
})
