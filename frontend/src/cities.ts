// Loads the city registry from config/cities.json — the single source of
// truth shared with the data-generation pipeline (pipeline/cities.py reads
// the same file via json.load). Vite/TypeScript both support importing
// .json natively (resolveJsonModule); server.fs.allow lets the dev server
// import it from outside frontend/.
import registry from '../../config/cities.json'
import type { CityConfigRaw, CityConfig, CountryConfig } from '@/types'

interface CitiesRegistry {
  cities: CityConfigRaw[]
  countries: Record<string, CountryConfig>
  defaultCity: string
}

const typedRegistry = registry as unknown as CitiesRegistry

// The framework ships with an empty config/cities.json (no city
// pre-configured) - fail loudly and clearly right here instead of a cryptic
// "cannot read properties of undefined" wherever the first component happens
// to touch CITIES/getCity().
if (!typedRegistry.cities?.length) {
  throw new Error(
    'config/cities.json has no cities configured yet.\n' +
    'Try a working example: make use-example COUNTRY=spain (or COUNTRY=burkina-faso)\n' +
    'Or add your own: make add-city ARGS="--city ... --country ... --timezone ... --agency-name ..."',
  )
}

// Slugs are the only uniqueness key used throughout (this array, getCity()'s
// .find(), pipeline/cities.py's CITIES dict) - never validated against the
// whole registry at once. A duplicate wouldn't crash here, just make one
// entry unreachable via getCity() while still showing twice in city
// pickers/auto-detect (duplicate :key in a v-for) - catch it explicitly.
const slugCounts = new Map<string, number>()
for (const c of typedRegistry.cities) {
  slugCounts.set(c.slug, (slugCounts.get(c.slug) ?? 0) + 1)
}
const duplicateSlugs = [...slugCounts].filter(([, n]) => n > 1).map(([slug]) => slug)
if (duplicateSlugs.length) {
  throw new Error(
    `config/cities.json has duplicate city slug(s): ${duplicateSlugs.join(', ')}.\n` +
    'Slugs must be unique across the whole registry, even across different countries - rename one of them.',
  )
}

// VITE_CITIES filters which cities from cities.json ship in this build
// (picker, city auto-detect). When unset, every registry entry is shown -
// cities.json alone is what pipeline/CI treat as "this city exists and
// needs its data generated/synced"; this only narrows the frontend.
const activeSlugs = (import.meta.env.VITE_CITIES ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

export const CITIES: CityConfigRaw[] = activeSlugs.length
  ? typedRegistry.cities.filter((c) => activeSlugs.includes(c.slug))
  : typedRegistry.cities

// A set-but-wrong VITE_CITIES (typo, stale slug after removing a city) can
// filter the registry down to nothing while cities.json itself is fine -
// same "fail loudly here" reasoning as the empty-registry check above,
// otherwise this surfaces as a cryptic crash wherever CITIES is first used.
if (activeSlugs.length && !CITIES.length) {
  throw new Error(
    `VITE_CITIES=${activeSlugs.join(',')} matched no city in config/cities.json ` +
    `(available: ${typedRegistry.cities.map((c) => c.slug).join(', ')}).\n` +
    'Fix the slug(s) in config/.env, or unset VITE_CITIES entirely to ship every city.',
  )
}

// VITE_DEFAULT_CITY overrides cities.json's defaultCity field.
export const DEFAULT_CITY_SLUG: string =
  import.meta.env.VITE_DEFAULT_CITY?.trim() || typedRegistry.defaultCity

export const COUNTRIES = typedRegistry.countries

// Returns the city with countryCode already resolved from its country
// (the JSON stores countryCode once per country, not repeated per city).
export function getCity(slug: string): CityConfig {
  const city =
    CITIES.find((c) => c.slug === slug) ??
    CITIES.find((c) => c.slug === DEFAULT_CITY_SLUG)!
  return { ...city, countryCode: COUNTRIES[city.country].countryCode }
}
