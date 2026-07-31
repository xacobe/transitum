/**
 * Canvas rendering for the stop map sprites: a colored circle with a white
 * mode-appropriate SVG icon inside (bus-stop sign, train, ferry, ...) - one
 * sprite per TransitMode, registered once per map instance (see MiniMap.vue).
 * Shared by MiniMap's main "you are here" sprite and the smaller, muted
 * nearby-stop sprite - same drawing, different size/color/stroke. Returns
 * ImageData ready for maplibre's map.addImage().
 */
import busStopSvg    from '@tabler/icons/outline/bus-stop.svg?raw'
import busSvg        from '@tabler/icons/outline/bus.svg?raw'
import trainSvg       from '@tabler/icons/outline/train.svg?raw'
import ferrySvg       from '@tabler/icons/outline/ferry.svg?raw'
import aerialLiftSvg  from '@tabler/icons/outline/aerial-lift.svg?raw'
import mountainSvg    from '@tabler/icons/outline/mountain.svg?raw'
import flagSvg        from '@tabler/icons/outline/flag-3.svg?raw'
import { METRO_ICON_INNER_SVG, TRAM_ICON_INNER_SVG } from '@/services/modeIconSvg'
import { cssVar } from '@/map/geometry'
import type { TransitMode } from '@/types'

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'

// Same fallback logic as ModeIcon.vue's TABLER_ICON map, in raw-SVG-string
// form for canvas rendering here instead of a Vue component - the two lists
// of which real mode borrows which glyph must stay in sync by hand, there's
// no way to share a Vue component's render output with a canvas context.
const MODE_SVG: Record<TransitMode, string> = {
  bus: busStopSvg,
  trolleybus: busSvg,
  rail: trainSvg,
  monorail: trainSvg,
  ferry: ferrySvg,
  aerial_lift: aerialLiftSvg,
  cable_tram: aerialLiftSvg,
  funicular: mountainSvg,
  metro: `${SVG_OPEN}${METRO_ICON_INNER_SVG}</svg>`,
  tram: `${SVG_OPEN}${TRAM_ICON_INNER_SVG}</svg>`,
}

// CSS custom property per TransitMode (see styles/tokens.css) - the single
// source of truth for "what color is this mode," shared by the map sprites
// below and ModeFilterBar.vue's chip styling.
const MODE_COLOR_VAR: Record<TransitMode, string> = {
  bus: '--color-mode-bus',
  trolleybus: '--color-mode-trolleybus',
  rail: '--color-mode-rail',
  monorail: '--color-mode-monorail',
  ferry: '--color-mode-ferry',
  aerial_lift: '--color-mode-aerial_lift',
  cable_tram: '--color-mode-cable_tram',
  funicular: '--color-mode-funicular',
  metro: '--color-mode-metro',
  tram: '--color-mode-tram',
}

export function modeColor(mode: TransitMode): string {
  return cssVar(MODE_COLOR_VAR[mode])
}

/** Colored circle with a white SVG icon centered inside - shared core for
 * drawStopIcon (per-TransitMode icons) and drawFlagIcon (origin flag). */
async function drawIconCircle(
  size: number,
  color: string,
  strokeWidth: number,
  svgRaw: string,
): Promise<ImageData> {
  const inner = Math.round(size * 0.52)
  const pad   = Math.round((size - inner) / 2)

  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = strokeWidth
  ctx.stroke()

  const svgWhite = svgRaw.replace(/currentColor/g, '#fff')
  await new Promise<void>((resolve) => {
    const blob = new Blob([svgWhite], { type: 'image/svg+xml' })
    const url  = URL.createObjectURL(blob)
    const img  = new Image()
    img.onload = () => { ctx.drawImage(img, pad, pad, inner, inner); URL.revokeObjectURL(url); resolve() }
    img.onerror = () => { URL.revokeObjectURL(url); resolve() }
    img.src = url
  })

  return ctx.getImageData(0, 0, size, size)
}

export function drawStopIcon(
  size: number,
  color: string,
  strokeWidth: number,
  mode: TransitMode = 'bus',
): Promise<ImageData> {
  return drawIconCircle(size, color, strokeWidth, MODE_SVG[mode] ?? busStopSvg)
}

/** Flag marker for a manually picked origin (search mode). */
export function drawFlagIcon(size: number, color: string, strokeWidth: number): Promise<ImageData> {
  return drawIconCircle(size, color, strokeWidth, flagSvg)
}

/**
 * Teardrop destination pin (route mode's "to" marker, see overlayLayers.ts's
 * ROUTE_TO_LAYER) - a circle with a triangular point tangent to its bottom,
 * built as one continuous path so the white stroke wraps the whole outline
 * with no seam. `icon-anchor: 'bottom'` (set on the layer) places the tip,
 * not the circle center, at the marker's actual coordinate.
 */
export function drawPin(size: number, color: string, strokeWidth = 3): ImageData {
  const w = size
  const h = Math.round(size * 1.3)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  const cx = w / 2
  const r = w / 2 - strokeWidth
  const cy = r + strokeWidth
  const tipY = h - strokeWidth
  const spread = Math.PI * 40 / 180 // how far the tangent points sit from the bottom (90°)
  const leftAngle = Math.PI / 2 + spread
  const rightAngle = Math.PI / 2 - spread

  ctx.beginPath()
  ctx.moveTo(cx, tipY)
  ctx.lineTo(cx + r * Math.cos(leftAngle), cy + r * Math.sin(leftAngle))
  ctx.arc(cx, cy, r, leftAngle, rightAngle, false) // long way round, through the top
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = strokeWidth
  ctx.stroke()

  return ctx.getImageData(0, 0, w, h)
}

