import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Transitum',
  description: 'Progressive web app framework for public transit',

  // Served at https://<org>.github.io/transitum/ (project page, not a
  // user/org root page) - every internal link and asset path needs this
  // prefix, which VitePress handles automatically as long as base is set
  // here rather than hardcoded into content.
  base: '/transitum/',

  // English is the root locale (no /en/ prefix, unchanged paths). French
  // lives under /fr/, mirroring the same file structure - see docs/fr/.
  // Content is never auto-translated: each locale's markdown is maintained
  // by hand, so a new page needs writing (not just linking) in both trees.
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/' },
          { text: 'Adding a city', link: '/cities/' },
          { text: 'Pipeline reference', link: '/pipeline/' },
          { text: 'Deployment', link: '/deployment/' },
          { text: 'Contributing', link: '/contributing/' },
        ],
        sidebar: {
          '/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Introduction', link: '/guide/' },
                { text: 'Quick start', link: '/guide/quick-start' },
                { text: 'Repository layout', link: '/guide/repository-layout' },
                { text: 'Architecture', link: '/guide/architecture' },
                { text: 'Offline architecture', link: '/guide/offline-architecture' },
                { text: 'POI search', link: '/guide/poi-search' },
              ],
            },
          ],
          '/cities/': [
            {
              text: 'Adding a city',
              items: [
                { text: 'Overview', link: '/cities/' },
                { text: 'OSM-synthetic vs official GTFS', link: '/cities/data-sources' },
                { text: 'Multi-source imports', link: '/cities/multi-source' },
                { text: 'Splitting interlined routes', link: '/cities/line-overrides' },
                { text: 'Generating map tiles', link: '/cities/map-tiles' },
                { text: 'Verifying your city', link: '/cities/verifying-your-city' },
                { text: 'Worked example: Bilbao', link: '/cities/worked-example-bilbao' },
              ],
            },
          ],
          '/pipeline/': [
            {
              text: 'Pipeline reference',
              items: [
                { text: 'Overview', link: '/pipeline/' },
                { text: 'City config schema', link: '/pipeline/config-schema' },
                { text: 'Generated data files', link: '/pipeline/data-files' },
              ],
            },
          ],
          '/deployment/': [
            {
              text: 'Deployment',
              items: [
                { text: 'Overview', link: '/deployment/' },
                { text: 'Environment variables', link: '/deployment/environment-variables' },
                { text: 'Theming a deployment', link: '/deployment/theming' },
                { text: 'Extending a deployment', link: '/deployment/extending' },
                { text: 'Analytics', link: '/deployment/analytics' },
                { text: 'Updating from upstream', link: '/deployment/updating-from-upstream' },
              ],
            },
          ],
          '/contributing/': [
            {
              text: 'Contributing',
              items: [
                { text: 'Overview & known issues', link: '/contributing/' },
              ],
            },
          ],
        },
        footer: {
          message: 'Released under the AGPL-3.0 License.',
        },
      },
    },

    fr: {
      label: 'Français',
      lang: 'fr',
      link: '/fr/',
      title: 'Transitum',
      description: "Framework d'application web progressive pour le transport public",
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/fr/guide/' },
          { text: 'Ajouter une ville', link: '/fr/cities/' },
          { text: 'Référence du pipeline', link: '/fr/pipeline/' },
          { text: 'Déploiement', link: '/fr/deployment/' },
          { text: 'Contribuer', link: '/fr/contributing/' },
        ],
        sidebar: {
          '/fr/guide/': [
            {
              text: 'Guide',
              items: [
                { text: 'Introduction', link: '/fr/guide/' },
                { text: 'Démarrage rapide', link: '/fr/guide/quick-start' },
                { text: 'Structure du dépôt', link: '/fr/guide/repository-layout' },
                { text: 'Architecture', link: '/fr/guide/architecture' },
                { text: 'Architecture hors ligne', link: '/fr/guide/offline-architecture' },
                { text: 'Recherche de POI', link: '/fr/guide/poi-search' },
              ],
            },
          ],
          '/fr/cities/': [
            {
              text: 'Ajouter une ville',
              items: [
                { text: 'Vue d’ensemble', link: '/fr/cities/' },
                { text: 'OSM synthétique vs GTFS officiel', link: '/fr/cities/data-sources' },
                { text: 'Imports multi-source', link: '/fr/cities/multi-source' },
                { text: 'Diviser des lignes interlignées', link: '/fr/cities/line-overrides' },
                { text: 'Générer les tuiles de carte', link: '/fr/cities/map-tiles' },
                { text: 'Vérifier votre ville', link: '/fr/cities/verifying-your-city' },
                { text: 'Exemple complet : Bilbao', link: '/fr/cities/worked-example-bilbao' },
              ],
            },
          ],
          '/fr/pipeline/': [
            {
              text: 'Référence du pipeline',
              items: [
                { text: 'Vue d’ensemble', link: '/fr/pipeline/' },
                { text: 'Schéma de configuration de ville', link: '/fr/pipeline/config-schema' },
                { text: 'Fichiers de données générés', link: '/fr/pipeline/data-files' },
              ],
            },
          ],
          '/fr/deployment/': [
            {
              text: 'Déploiement',
              items: [
                { text: 'Vue d’ensemble', link: '/fr/deployment/' },
                { text: 'Variables d’environnement', link: '/fr/deployment/environment-variables' },
                { text: 'Personnaliser l’apparence', link: '/fr/deployment/theming' },
                { text: 'Étendre un déploiement', link: '/fr/deployment/extending' },
                { text: 'Analytics', link: '/fr/deployment/analytics' },
                { text: 'Mettre à jour depuis l’upstream', link: '/fr/deployment/updating-from-upstream' },
              ],
            },
          ],
          '/fr/contributing/': [
            {
              text: 'Contribuer',
              items: [
                { text: 'Vue d’ensemble et problèmes connus', link: '/fr/contributing/' },
              ],
            },
          ],
        },
        footer: {
          message: 'Publié sous licence AGPL-3.0.',
        },
      },
    },
  },

  themeConfig: {
    // Shared across every locale.
    socialLinks: [
      { icon: 'github', link: 'https://github.com/xacobe/transitum' },
    ],

    search: {
      provider: 'local',
      options: {
        locales: {
          fr: {
            translations: {
              button: {
                buttonText: 'Rechercher',
                buttonAriaLabel: 'Rechercher',
              },
              modal: {
                noResultsText: 'Aucun résultat pour',
                resetButtonTitle: 'Réinitialiser la recherche',
                footer: {
                  selectText: 'sélectionner',
                  navigateText: 'naviguer',
                  closeText: 'fermer',
                },
              },
            },
          },
        },
      },
    },
  },
})
