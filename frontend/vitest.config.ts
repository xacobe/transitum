import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Standalone config for unit tests - deliberately does NOT load
// vite.config.js, whose plugins (PWA, i18n precompile, dev middleware) are
// build/dev concerns irrelevant to unit tests and pull in heavy transforms.
// Only the '@' alias is shared, so specs can import modules the same way
// application code does.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/services/**', 'src/map/**'],
    },
  },
})
