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
