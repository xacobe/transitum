import type { TransitMode } from '@/types'

// Raw SVG inner markup (no wrapping <svg> tag) for the two transit modes
// Tabler has no dedicated glyph for - metro and tram. Same stroke/viewBox
// conventions as Tabler's own icons (24x24, stroke-width 2, round caps).
// Shared between ModeIcon.vue (Vue-rendered, via v-html) and map/stopIcon.ts
// (canvas-rendered, via a raw <svg> string) so the two never drift apart.
export const METRO_ICON_INNER_SVG =
  '<circle cx="12" cy="12" r="9" /><path d="M8 15.5v-6l4 5l4 -5v6" />'

export const TRAM_ICON_INNER_SVG =
  '<path d="M9 5v-2" /><path d="M7 5h4" />' +
  '<path d="M5 16v-7a3 3 0 0 1 3 -3h8a3 3 0 0 1 3 3v7" /><path d="M9 9h6" />' +
  '<path d="M3 16h18" /><path d="M8 19l-1 -3" /><path d="M16 19l1 -3" />'

// Rarer/more distinctive modes first - a stop can be served by several
// modes at once (a metro station that's also a bus stop, say), but a map
// marker only ever shows one icon. Showing whichever mode is least likely
// to also be reachable a block away is more useful at a glance than
// defaulting to bus, which almost every multi-modal stop also has.
const MODE_ICON_PRIORITY: TransitMode[] = [
  'rail', 'metro', 'monorail', 'tram', 'cable_tram', 'aerial_lift',
  'funicular', 'ferry', 'trolleybus', 'bus',
]

/** Picks which of a stop's modes gets the map icon - see MODE_ICON_PRIORITY. */
export function pickStopIconMode(modes: TransitMode[] | undefined): TransitMode {
  if (!modes?.length) return 'bus'
  for (const mode of MODE_ICON_PRIORITY) {
    if (modes.includes(mode)) return mode
  }
  return 'bus'
}
