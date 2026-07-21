/**
 * Memoizes a per-city-slug async loader: each slug's promise is created
 * once and reused, so switching cities never re-fetches a dataset already
 * loaded, and never accidentally serves one city's data under another's slug.
 *
 * A rejected load is evicted rather than cached, so a transient failure (a
 * dropped connection, a not-yet-deployed data file) can be retried on the
 * next call instead of poisoning the slug's entry for the lifetime of the page.
 */
export function createCityDataCache<T>(
  loader: (slug: string) => Promise<T>,
): (slug: string) => Promise<T> {
  const cache = new Map<string, Promise<T>>()
  return function load(slug: string): Promise<T> {
    if (!cache.has(slug)) {
      const pending = loader(slug)
      pending.catch(() => {
        if (cache.get(slug) === pending) cache.delete(slug)
      })
      cache.set(slug, pending)
    }
    return cache.get(slug)!
  }
}
