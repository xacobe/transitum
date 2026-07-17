import { defineStore } from 'pinia'

const STORAGE_KEY = 'transit_theme'

export const useThemeStore = defineStore('theme', {
  state: (): { theme: 'light' | 'dark' } => ({
    theme: 'light',
  }),
  getters: {
    isDark: (state): boolean => state.theme === 'dark',
  },
  actions: {
    init(): void {
      const saved = localStorage.getItem(STORAGE_KEY)
      this.theme = saved === 'dark' || saved === 'light' ? saved : 'light'
      this.apply()
    },
    toggleTheme(): void {
      this.theme = this.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem(STORAGE_KEY, this.theme)
      this.apply()
    },
    apply(): void {
      document.documentElement.setAttribute('data-theme', this.theme)
    },
  },
})
