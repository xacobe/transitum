import { createRouter, createWebHistory } from 'vue-router'
import ListHomeView from '@/views/ListHomeView.vue'
import { customization } from '@/customization'

declare module 'vue-router' {
  interface RouteMeta {
    homeRouteName?: string
    resultsRouteName?: string
  }
}

const SearchView = () => import('@/views/DestinationSearchView.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/carte', name: 'home', component: () => import('@/views/HomeView.vue') },
    {
      path: '/recherche', name: 'search', component: SearchView,
      meta: { homeRouteName: 'home', resultsRouteName: 'mapResults' },
    },
    { path: '/resultats', name: 'mapResults', component: () => import('@/views/MapResultsView.vue') },
    { path: '/arret/:stopId', name: 'stop', component: () => import('@/views/StopView.vue') },
    // Liste is the app's entry screen — statically imported so it renders
    // on first paint without an extra dynamic-import round-trip.
    { path: '/', name: 'list', component: ListHomeView },
    {
      path: '/liste/recherche', name: 'listSearch', component: SearchView,
      meta: { homeRouteName: 'list', resultsRouteName: 'listResults' },
    },
    { path: '/liste/resultats', name: 'listResults', component: () => import('@/views/ListResultsView.vue') },
    { path: '/lines', name: 'lines', component: () => import('@/views/LinesView.vue') },
    { path: '/lines/:shortName', name: 'line', component: () => import('@/views/LineView.vue') },
    { path: '/favorites', name: 'favorites', component: () => import('@/views/FavorisView.vue') },
    { path: '/reglages', name: 'settings', component: () => import('@/views/SettingsView.vue') },
    { path: '/aide', name: 'help', component: () => import('@/views/HelpView.vue') },
    // Not linked from anywhere in the nav - reference page for the
    // design system (tokens + live components), reachable only by URL.
    { path: '/styleguide', name: 'styleguide', component: () => import('@/views/StyleguideView.vue') },
    // Admin panel - URL-only, protected by PocketBase admin auth.
    { path: '/administro', name: 'admin', component: () => import('@/views/AdminView.vue') },
  ],
})

// Deployment-owned extra routes (frontend/src/custom/index.ts, if this
// deployment has one) - appended, never replacing a framework route. A
// name collision is unsupported (component shadowing was deliberately
// rejected, see README's "Theming and extending a deployment"), so it's
// skipped with a warning instead of silently overriding the framework view.
for (const route of customization.routes) {
  if (route.name && router.hasRoute(route.name)) {
    if (import.meta.env.DEV) {
      console.warn(`[customization] route name '${String(route.name)}' collides with a framework route - skipped`)
    }
    continue
  }
  router.addRoute(route)
}

// When a service worker serves stale chunk filenames after a new deploy,
// dynamic imports fail with "Failed to fetch dynamically imported module".
// A hard navigation forces the new SW (skipWaiting:true) to serve fresh
// chunks. The sessionStorage guard prevents infinite loops if the chunk
// is genuinely missing (e.g. the server deploy failed mid-transfer).
router.onError((error, to) => {
  const isMissingChunk =
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('Importing a module script failed') ||
    error.message.includes('Unable to preload CSS')
  if (isMissingChunk) {
    const key = `sw_chunk_reload:${to.fullPath}`
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      window.location.assign(to.fullPath)
    }
  }
})

export default router
