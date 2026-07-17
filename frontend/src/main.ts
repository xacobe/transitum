import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/tokens.css'
import './styles/fonts.css'
import './styles/base.css'
import './styles/modules.css'
// Deployment-owned overrides (config/theme.css, if this deployment has one)
// - imported last so its custom-property re-declarations win the cascade.
// See frontend/vite.config.js's "deployment-theme" plugin.
import 'virtual:deployment-theme.css'
import App from './App.vue'
import router from './router'
import { i18n } from './i18n'
import { useThemeStore } from './stores/theme'
import { useFavoritesStore } from './stores/favorites'
import { useCityStore } from './stores/city'
import { customization } from './customization'
import { track } from './composables/useAnalytics'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)

// Deployment-owned install hook (frontend/src/custom/index.ts, if this
// deployment has one) - runs before the framework's own stores are
// initialized, so it can register Pinia plugins/stores those stores may
// depend on.
customization.install?.(app)

useThemeStore().init()
useFavoritesStore().init()
useCityStore().init()

app.mount('#app')

// Track PWA installs — fires once when the user adds the app to their
// home screen.
window.addEventListener('appinstalled', () => {
  track('pwa-installed')
})
