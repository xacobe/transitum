import MiniSearch from 'minisearch'
import { normalize } from '@/services/textNormalize'
import { loadCityStops, loadCityPois } from '@/services/cityData'
import type { SearchResult, SearchResultIcon } from '@/types'

interface IndexDoc {
  id: string
  name: string
  lat: number
  lon: number
  type: string
  tier: number  // 0 = stop, 1-3 = POI tier
  source: 'stop' | 'poi'
}

const TYPE_TO_ICON: Record<string, SearchResultIcon> = {
  stop:         'stop',
  hospital:     'hospital',
  clinic:       'hospital',
  health:       'hospital',
  marketplace:  'marketplace',
  university:   'university',
  school:       'university',
  neighbourhood:'neighbourhood',
  transit:      'transit',
  bank:         'bank',
  pharmacy:     'pharmacy',
  hotel:        'hotel',
  food:         'food',
  shop:         'shop',
}

// One MiniSearch instance per city slug, built once and reused.
const indexCache = new Map<string, Promise<MiniSearch<IndexDoc>>>()

function buildIndex(slug: string): Promise<MiniSearch<IndexDoc>> {
  const ms = new MiniSearch<IndexDoc>({
    idField: 'id',
    fields: ['name'],
    storeFields: ['id', 'name', 'lat', 'lon', 'type', 'tier', 'source'],
    // Apply the same accent/case normalization used elsewhere in the app.
    processTerm: (term) => normalize(term) || null,
  })

  return Promise.all([loadCityStops(slug), loadCityPois(slug)]).then(([stops, pois]) => {
    const docs: IndexDoc[] = [
      ...stops.map((s) => ({
        id:     `stop/${s.id}`,
        name:   s.name,
        lat:    s.lat,
        lon:    s.lon,
        type:   'stop',
        tier:   0,
        source: 'stop' as const,
      })),
      ...pois.map((p) => ({
        id:     p.id,
        name:   p.name,
        lat:    p.lat,
        lon:    p.lon,
        type:   p.type,
        tier:   p.tier,
        source: 'poi' as const,
      })),
    ]
    ms.addAll(docs)
    return ms
  })
}

function getIndex(slug: string): Promise<MiniSearch<IndexDoc>> {
  if (!indexCache.has(slug)) {
    indexCache.set(slug, buildIndex(slug))
  }
  return indexCache.get(slug)!
}

export async function searchLocal(
  query: string,
  slug: string,
  limit = 8,
): Promise<SearchResult[]> {
  if (!query.trim()) return []
  const ms = await getIndex(slug)

  const raw = ms.search(query, {
    prefix: true,
    fuzzy: 0.2,
    // Rank stops above POIs; within POIs, lower tier number = higher rank.
    boostDocument: (_id, _term, fields) => {
      const f = fields as unknown as IndexDoc
      return f?.source === 'stop' ? 4 : 4 - (f?.tier ?? 3)
    },
  })

  // Deduplicate stops by normalized name (stops appear once per direction).
  const seenStopNames = new Set<string>()
  const results: SearchResult[] = []

  for (const hit of raw) {
    if (results.length >= limit) break
    const f = hit as unknown as IndexDoc

    if (f.source === 'stop') {
      const key = normalize(f.name)
      if (seenStopNames.has(key)) continue
      seenStopNames.add(key)
    }

    results.push({
      id:     f.id,
      name:   f.name,
      sub:    '',
      lat:    f.lat,
      lon:    f.lon,
      source: f.source,
      icon:   TYPE_TO_ICON[f.type] ?? 'place',
    })
  }

  return results
}
