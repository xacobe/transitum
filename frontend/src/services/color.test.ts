import { describe, it, expect } from 'vitest'
import { contrastingTextColor } from './color'

describe('contrastingTextColor', () => {
  it('uses black text on a white background', () => {
    expect(contrastingTextColor('#ffffff')).toBe('#000000')
  })

  it('uses white text on a black background', () => {
    expect(contrastingTextColor('#000000')).toBe('#ffffff')
  })

  it('uses black text on pale/light backgrounds', () => {
    expect(contrastingTextColor('#ffff00')).toBe('#000000') // vivid yellow
    expect(contrastingTextColor('#e0e0e0')).toBe('#000000') // light grey
  })

  it('uses white text on dark backgrounds', () => {
    expect(contrastingTextColor('#0060a8')).toBe('#ffffff') // Vitrasa blue
    expect(contrastingTextColor('#77298f')).toBe('#ffffff') // Vitrasa purple
  })

  it('prefers white on saturated mid-tones that only barely clear WCAG AA', () => {
    // These pass AA (~5.5:1) against black but read as low-contrast, so the
    // 6:1 threshold deliberately picks white instead (see module comment).
    expect(contrastingTextColor('#ed4713')).toBe('#ffffff') // orange
    expect(contrastingTextColor('#009900')).toBe('#ffffff') // green
  })
})
