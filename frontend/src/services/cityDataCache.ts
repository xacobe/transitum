/**
 * Memoizes a per-city-slug async loader: each slug's promise is created
 * once and reused, so switching cities never re-fetches a dataset already
 * loaded, and never accidentally serves one city's data under another's slug.
 */
export function createCityDataCache<T>(
  loader: (slug: string) => Promise<T>,
): (slug: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return function load(slug: string): Promise<T> {
    if (!cache.has(slug)) {
      cache.set(slug, loader(slug))
    }
    return cache.get(slug)!
  }
}
