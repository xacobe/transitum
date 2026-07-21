import { describe, it, expect } from 'vitest'
import { normalize } from './textNormalize'

describe('normalize', () => {
  it('lowercases input', () => {
    expect(normalize('MARCHÉ')).toBe('marche')
    expect(normalize('Bilbao')).toBe('bilbao')
  })

  it('strips diacritics so accented/unaccented forms match', () => {
    expect(normalize('marché')).toBe('marche')
    expect(normalize('Marché')).toBe(normalize('marche'))
    expect(normalize('Ürdüliz')).toBe('urduliz')
    expect(normalize('A Coruña')).toBe('a coruna')
  })

  it('leaves plain ASCII untouched', () => {
    expect(normalize('plaza nueva')).toBe('plaza nueva')
  })

  it('handles the empty string', () => {
    expect(normalize('')).toBe('')
  })
})
