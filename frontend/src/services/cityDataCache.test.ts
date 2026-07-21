import { describe, it, expect, vi } from 'vitest'
import { createCityDataCache } from './cityDataCache'

describe('createCityDataCache', () => {
  it('invokes the loader once per slug and reuses the promise', async () => {
    const loader = vi.fn((slug: string) => Promise.resolve(`data:${slug}`))
    const load = createCityDataCache(loader)

    const a1 = load('bilbao')
    const a2 = load('bilbao')

    expect(a1).toBe(a2) // same promise instance, not just equal value
    expect(await a1).toBe('data:bilbao')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('keeps separate entries per slug', async () => {
    const loader = vi.fn((slug: string) => Promise.resolve(slug.toUpperCase()))
    const load = createCityDataCache(loader)

    expect(await load('bilbao')).toBe('BILBAO')
    expect(await load('ouagadougou')).toBe('OUAGADOUGOU')
    expect(await load('bilbao')).toBe('BILBAO')
    expect(loader).toHaveBeenCalledTimes(2)
    expect(loader).toHaveBeenCalledWith('bilbao')
    expect(loader).toHaveBeenCalledWith('ouagadougou')
  })

  it('caches the promise even before it resolves (no duplicate in-flight loads)', () => {
    let resolveFn: (v: string) => void = () => {}
    const loader = vi.fn(
      () => new Promise<string>((resolve) => { resolveFn = resolve }),
    )
    const load = createCityDataCache(loader)

    load('x')
    load('x')
    expect(loader).toHaveBeenCalledTimes(1)
    resolveFn('done')
  })

  it('evicts a rejected load so the next call retries instead of staying poisoned', async () => {
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce('data:bilbao')
    const load = createCityDataCache(loader)

    await expect(load('bilbao')).rejects.toThrow('network blip')
    expect(await load('bilbao')).toBe('data:bilbao')
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
