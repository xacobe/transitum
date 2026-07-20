import { ref, watchEffect } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useCityStore } from '@/stores/city'
import { useAgencies, lineKey } from '@/composables/useAgencies'
import { loadCityRoutes } from '@/services/cityData'
import { getLineColorOverride } from '@/cities'
import { contrastingTextColor } from '@/services/color'

// 12 pairs [bgLight, textLight, bgDark, textDark] with good contrast in
// both themes. The real lines are indexed by hash, no manual per-line table.
const LINE_PALETTE: [string, string, string, string][] = [
  ['#0a8a5a', '#fff', '#2fce86', '#07120d'],
  ['#d2641a', '#fff', '#f2914d', '#241206'],
  ['#2563b6', '#fff', '#5b9bf0', '#06122a'],
  ['#7c3aed', '#fff', '#a78bfa', '#1e1033'],
  ['#c2410c', '#fff', '#fb923c', '#2a1304'],
  ['#0e7490', '#fff', '#22d3ee', '#042a30'],
  ['#a16207', '#fff', '#facc15', '#2b2103'],
  ['#be185d', '#fff', '#f472b6', '#2b0a18'],
  ['#4d7c0f', '#fff', '#a3e635', '#1a2604'],
  ['#5b21b6', '#fff', '#c4b5fd', '#1f1338'],
  ['#0369a1', '#fff', '#7dd3fc', '#072a3d'],
  ['#b45309', '#fff', '#fbbf24', '#2b1903'],
]

function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// Module-level (not per-composable-instance) so the several components that
// each call useLineColor() share one lookup instead of each fetching/
// rebuilding it. Keyed by lineKey(agencyId, shortName); only ever populated
// when the active city opts in (CityConfigRaw.useOfficialLineColors).
const officialColors = ref<Map<string, { bg: string; text: string }>>(new Map())
let officialColorsForSlug = ''

export function useLineColor() {
  const theme = useThemeStore()
  const city = useCityStore()
  const { hasMultipleAgencies } = useAgencies()

  watchEffect(async () => {
    if (!city.activeCity.useOfficialLineColors) {
      officialColors.value = new Map()
      officialColorsForSlug = ''
      return
    }
    if (officialColorsForSlug === city.activeSlug) return
    const routes = await loadCityRoutes(city.activeSlug)

    const routesByAgency = new Map<string, typeof routes>()
    for (const route of routes) {
      if (!route.color) continue
      if (!routesByAgency.has(route.agencyId)) routesByAgency.set(route.agencyId, [])
      routesByAgency.get(route.agencyId)!.push(route)
    }

    const map = new Map<string, { bg: string; text: string }>()
    for (const agencyRoutes of routesByAgency.values()) {
      // A single route_color shared by every one of an agency's routes isn't
      // really per-line branding (e.g. EMT Madrid publishes the same
      // corporate blue for all ~230 bus routes, while Metro Madrid's feed
      // has a real distinct color per line) - falling back to the hash
      // palette for that agency actually distinguishes its lines, instead
      // of rendering every one of them identically.
      const distinctColors = new Set(agencyRoutes.map((r) => r.color))
      if (agencyRoutes.length > 1 && distinctColors.size === 1) continue
      for (const route of agencyRoutes) {
        map.set(lineKey(route.agencyId, route.shortName), {
          bg: route.color!,
          // Computed, not route.textColor - real feeds set it unreliably
          // (Vitrasa's is "000000" for every line regardless of how dark
          // route_color is), so a declared value can't be trusted for
          // contrast. See contrastingTextColor's own comment.
          text: contrastingTextColor(route.color!),
        })
      }
    }
    officialColors.value = map
    officialColorsForSlug = city.activeSlug
  })

  // `agencyId` only enters the hash once a city actually has more than
  // one agency — while there's only one (today, always), the hash stays
  // exactly `shortName` so every line keeps today's color unchanged.
  function colorFor(shortName: string, agencyId: string | null): { bg: string; text: string } {
    // config/line-colors.json - a deployment's explicit per-line choice -
    // always wins, whether or not useOfficialLineColors is even on.
    const override = getLineColorOverride(city.activeSlug, shortName)
    if (override) return override

    const official = officialColors.value.get(lineKey(agencyId, shortName))
    if (official) return official

    const key = hasMultipleAgencies.value ? lineKey(agencyId, shortName) : String(shortName)
    const idx = hashString(key.toUpperCase()) % LINE_PALETTE.length
    const [bgLight, textLight, bgDark, textDark] = LINE_PALETTE[idx]
    return theme.isDark ? { bg: bgDark, text: textDark } : { bg: bgLight, text: textLight }
  }

  return { colorFor }
}
