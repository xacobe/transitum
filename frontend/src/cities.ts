// Loads the city registry from config/cities/ — the single source of truth
// shared with the data-generation pipeline (pipeline/cities.py glob-loads
// the same directory). One city per config/cities/<slug>.json file, plus a
// single config/cities/_countries.json for the country registry and the
// default-city slug. import.meta.glob (Vite-native, works for paths outside
// frontend/ the same way the old static JSON import did) loads every city
// file at build time - `eager: true` because this is small registry data
// needed synchronously at startup, not something worth code-splitting.
import countriesFile from '../../config/cities/_countries.json'
// Per-line color overrides (config/line-colors.json, see its .example.jsonc)
// - same loading mechanism, same "framework reads it, ships an empty
// default, deployment owns the real content" story as config/cities/ itself.
// Seeded by `make line-colors CITY=slug` (pipeline/seed_line_colors.py),
// then hand-edited freely.
import lineColorsRegistry from '../../config/line-colors.json'
import type { CityConfigRaw, CityConfig, CountryConfig } from '@/types'

interface CountriesFile {
  countries: Record<string, CountryConfig>
  defaultCity: string
}

interface LineColorOverride {
  bg: string
  text: string
}

const typedLineColors = lineColorsRegistry as unknown as Record<string, Record<string, LineColorOverride>>

// Checked before both the official-GTFS color (the city config's
// useOfficialLineColors) and the framework's hash-based fallback palette -
// see useLineColor.ts. Keyed by shortName alone, not lineKey(agencyId,
// shortName): every city this framework has shipped so far has exactly one
// agency (see useAgencies.ts), and a plain shortName is far easier to
// hand-edit in the JSON file than a composite key. Revisit if a real city
// ever has two agencies sharing a line number.
export function getLineColorOverride(citySlug: string, shortName: string): LineColorOverride | null {
  return typedLineColors[citySlug]?.[shortName] ?? null
}

const cityModules = import.meta.glob<{ default: CityConfigRaw }>(
  '../../config/cities/*.json',
  { eager: true },
)

const typedCountriesFile = countriesFile as unknown as CountriesFile

const allCities: CityConfigRaw[] = Object.entries(cityModules)
  .filter(([path]) => !path.endsWith('/_countries.json'))
  .map(([, mod]) => mod.default)

// The framework ships with an empty config/cities/ (no city pre-configured)
// - fail loudly and clearly right here instead of a cryptic "cannot read
// properties of undefined" wherever the first component happens to touch
// CITIES/getCity().
if (!allCities.length) {
  throw new Error(
    'config/cities/ has no cities configured yet.\n' +
    'Try a working example: make use-example COUNTRY=spain (or COUNTRY=burkina-faso)\n' +
    'Or add your own: make add-city ARGS="--city ... --country ... --timezone ... --agency-name ..."',
  )
}

// One file per city means a filename collision is already impossible - the
// only way to still get a dupe is a city's own "slug" field disagreeing
// with its filename, or two files whose "slug" fields collide despite
// different filenames. Both are checked here (pipeline/cities.py checks
// the same thing on its side of this shared directory).
for (const [path, mod] of Object.entries(cityModules)) {
  if (path.endsWith('/_countries.json')) continue
  const filenameSlug = path.split('/').pop()!.replace(/\.json$/, '')
  if (mod.default.slug !== filenameSlug) {
    throw new Error(
      `config/cities/${filenameSlug}.json has "slug": "${mod.default.slug}", ` +
      `which must match its filename ("${filenameSlug}") - rename the file or fix the field.`,
    )
  }
}
const slugCounts = new Map<string, number>()
for (const c of allCities) {
  slugCounts.set(c.slug, (slugCounts.get(c.slug) ?? 0) + 1)
}
const duplicateSlugs = [...slugCounts].filter(([, n]) => n > 1).map(([slug]) => slug)
if (duplicateSlugs.length) {
  throw new Error(`Duplicate city slug(s) in config/cities/: ${duplicateSlugs.join(', ')}.`)
}

// VITE_CITIES filters which cities from config/cities/ ship in this build
// (picker, city auto-detect). When unset, every registry entry is shown -
// config/cities/ alone is what pipeline/CI treat as "this city exists and
// needs its data generated/synced"; this only narrows the frontend.
const activeSlugs = (import.meta.env.VITE_CITIES ?? '')
  .split(',')
  .map((s: string) => s.trim())
  .filter(Boolean)

export const CITIES: CityConfigRaw[] = activeSlugs.length
  ? allCities.filter((c) => activeSlugs.includes(c.slug))
  : allCities

// A set-but-wrong VITE_CITIES (typo, stale slug after removing a city) can
// filter the registry down to nothing while config/cities/ itself is fine -
// same "fail loudly here" reasoning as the empty-registry check above,
// otherwise this surfaces as a cryptic crash wherever CITIES is first used.
if (activeSlugs.length && !CITIES.length) {
  throw new Error(
    `VITE_CITIES=${activeSlugs.join(',')} matched no city in config/cities/ ` +
    `(available: ${allCities.map((c) => c.slug).join(', ')}).\n` +
    'Fix the slug(s) in config/.env, or unset VITE_CITIES entirely to ship every city.',
  )
}

// VITE_DEFAULT_CITY overrides _countries.json's defaultCity field.
export const DEFAULT_CITY_SLUG: string =
  import.meta.env.VITE_DEFAULT_CITY?.trim() || typedCountriesFile.defaultCity

export const COUNTRIES = typedCountriesFile.countries

// Returns the city with countryCode already resolved from its country
// (the JSON stores countryCode once per country, not repeated per city).
export function getCity(slug: string): CityConfig {
  const city =
    CITIES.find((c) => c.slug === slug) ??
    CITIES.find((c) => c.slug === DEFAULT_CITY_SLUG)!
  return { ...city, countryCode: COUNTRIES[city.country].countryCode }
}
