import { createRouter, createWebHistory } from 'vue-router'
import ListHomeView from '@/views/ListHomeView.vue'
import { customization } from '@/customization'
import type { FrameworkRouteName } from '@/customization'

declare module 'vue-router' {
  interface RouteMeta {
    homeRouteName?: string
    resultsRouteName?: string
  }
}

const SearchView = () => import('@/views/DestinationSearchView.vue')

// The framework's own paths are plain English - a deployment whose primary
// language isn't English can override any of them via customization's
// routePaths (see contract.ts) instead of forking this file. Route *names*
// never change, so in-app navigation (which always goes through named
// routes) needs no other changes when a path is overridden.
function p(name: FrameworkRouteName, fallback: string): string {
  return customization.routePaths[name] ?? fallback
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: p('home', '/map'), name: 'home', component: () => import('@/views/HomeView.vue') },
    {
      path: p('search', '/search'), name: 'search', component: SearchView,
      meta: { homeRouteName: 'home', resultsRouteName: 'mapResults' },
    },
    { path: p('mapResults', '/results'), name: 'mapResults', component: () => import('@/views/MapResultsView.vue') },
    { path: p('stop', '/stop/:stopId'), name: 'stop', component: () => import('@/views/StopView.vue') },
    // List is the app's entry screen — statically imported so it renders
    // on first paint without an extra dynamic-import round-trip.
    { path: p('list', '/'), name: 'list', component: ListHomeView },
    {
      path: p('listSearch', '/list/search'), name: 'listSearch', component: SearchView,
      meta: { homeRouteName: 'list', resultsRouteName: 'listResults' },
    },
    { path: p('listResults', '/list/results'), name: 'listResults', component: () => import('@/views/ListResultsView.vue') },
    { path: p('lines', '/lines'), name: 'lines', component: () => import('@/views/LinesView.vue') },
    { path: p('line', '/lines/:shortName'), name: 'line', component: () => import('@/views/LineView.vue') },
    { path: p('favorites', '/favorites'), name: 'favorites', component: () => import('@/views/FavorisView.vue') },
    { path: p('settings', '/settings'), name: 'settings', component: () => import('@/views/SettingsView.vue') },
    { path: p('help', '/help'), name: 'help', component: () => import('@/views/HelpView.vue') },
    // Not linked from anywhere in the nav - reference page for the
    // design system (tokens + live components), reachable only by URL.
    { path: p('styleguide', '/styleguide'), name: 'styleguide', component: () => import('@/views/StyleguideView.vue') },
    // Admin panel - URL-only, protected by PocketBase admin auth.
    { path: p('admin', '/admin'), name: 'admin', component: () => import('@/views/AdminView.vue') },
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
