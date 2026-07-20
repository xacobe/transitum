import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Transitum',
  description: 'Progressive web app framework for public transit',

  // Served at https://<org>.github.io/transitum/ (project page, not a
  // user/org root page) - every internal link and asset path needs this
  // prefix, which VitePress handles automatically as long as base is set
  // here rather than hardcoded into content.
  base: '/transitum/',

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

    socialLinks: [
      { icon: 'github', link: 'https://github.com/xacobe/transitum' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the AGPL-3.0 License.',
    },
  },
})
