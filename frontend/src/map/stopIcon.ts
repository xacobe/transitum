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

export async function drawStopIcon(
  size: number,
  color: string,
  strokeWidth: number,
  mode: TransitMode = 'bus',
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

  const svgWhite = (MODE_SVG[mode] ?? busStopSvg).replace(/currentColor/g, '#fff')
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
