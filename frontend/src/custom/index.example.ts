// Deployment-owned extension point. Copy this file to custom/index.ts (same
// folder) to activate it - the framework never creates or reads that file,
// only this .example.ts, which stays here as a type-checked reference (see
// frontend/src/customization/contract.ts for the full contract, and the
// README's "Theming and extending a deployment" section for how this fits
// into the framework/deployment split).
//
// Everything below is optional - include only what you need.

import { IconHeart } from '@tabler/icons-vue'
import { defineCustomization } from '@/customization'

export default defineCustomization({
  version: 1,

  routes: [
    {
      path: '/about',
      name: 'about',
      // Lazy import - this module is bundled into the app's entry chunk,
      // so keep any route components you add split out like this.
      component: () => import('./AboutView.example.vue'),
    },
  ],

  // The framework's own URL paths (/map, /search, /stop/:stopId, ...) are
  // plain English regardless of VITE_DEFAULT_LOCALE - override any of them
  // here if your deployment's primary language isn't English. Route names
  // never change, so nothing else in the app needs updating. Keep a
  // route's :param segment if it has one (see FrameworkRouteName's list in
  // customization/contract.ts).
  // routePaths: {
  //   home: '/carte',
  //   search: '/recherche',
  //   stop: '/arret/:stopId',
  //   settings: '/reglages',
  //   help: '/aide',
  // },

  navItems: [
    {
      to: '/about',
      icon: IconHeart,
      label: { fr: 'À propos', en: 'About' },
      activeRouteNames: ['about'],
    },
  ],

  // install(app) {
  //   app.use(myExtraPiniaPlugin)
  // },

  // analytics: {
  //   track(eventName, data) {
  //     myOwnAnalytics.send(eventName, data)
  //   },
  // },

  // async submitReport(payload) {
  //   await fetch('https://my-own-backend.example/reports', {
  //     method: 'POST',
  //     body: JSON.stringify(payload),
  //   })
  // },
})
