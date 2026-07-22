import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useThemeStore } from './theme'

describe('useThemeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to light', () => {
    const store = useThemeStore()
    expect(store.theme).toBe('light')
    expect(store.isDark).toBe(false)
  })

  it('init() reads a valid saved theme from localStorage', () => {
    localStorage.setItem('transit_theme', 'dark')
    const store = useThemeStore()
    store.init()
    expect(store.theme).toBe('dark')
    expect(store.isDark).toBe(true)
  })

  it('init() falls back to light for a corrupt/unrecognized stored value', () => {
    localStorage.setItem('transit_theme', 'not-a-real-theme')
    const store = useThemeStore()
    store.init()
    expect(store.theme).toBe('light')
  })

  it('init() applies the theme to the document element', () => {
    localStorage.setItem('transit_theme', 'dark')
    const store = useThemeStore()
    store.init()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('toggleTheme flips the theme, persists it, and re-applies it', () => {
    const store = useThemeStore()
    store.toggleTheme()
    expect(store.theme).toBe('dark')
    expect(localStorage.getItem('transit_theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    store.toggleTheme()
    expect(store.theme).toBe('light')
    expect(localStorage.getItem('transit_theme')).toBe('light')
  })
})
