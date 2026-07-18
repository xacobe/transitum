// WCAG 2.0 relative luminance - picks whichever of black/white actually
// contrasts against a given background, instead of trusting a declared
// text color. Needed because real-world GTFS feeds are not reliable here:
// Vitrasa's route_text_color is "000000" for every single line regardless
// of how dark route_color is (e.g. #0060a8, #77298f) - agencies publish
// brand colors, not accessibility-reviewed pairs.
function srgbToLinear(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

// Black is only used once it clears this ratio - deliberately well above
// WCAG AA's bare 4.5:1 minimum. Plain "whichever ratio wins" put black on
// vivid mid-tone backgrounds (Vitrasa's #ed4713 orange at 5.51:1, #009900
// green at 5.56:1, ...) that technically pass AA but read as low-contrast
// in practice - saturated hues seem to need a clearer margin than pale
// ones for text to feel legible, which raw relative-luminance math alone
// doesn't capture. 6:1 sits comfortably between AA (4.5) and AAA (7),
// verified against this app's actual official/palette colors to land
// white exactly on the ones that looked wrong and nowhere else.
const BLACK_MIN_CONTRAST = 6

// Ported 1:1 in pipeline/seed_line_colors.py (contrasting_text_color) -
// keep both in sync, verified to produce identical output before relying
// on that.
export function contrastingTextColor(bgHex: string): '#000000' | '#ffffff' {
  const luminance = relativeLuminance(bgHex)
  const contrastWithBlack = (luminance + 0.05) / 0.05
  return contrastWithBlack >= BLACK_MIN_CONTRAST ? '#000000' : '#ffffff'
}
