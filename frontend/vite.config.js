import { fileURLToPath, URL } from 'node:url'
import { createReadStream, statSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve, extname, dirname } from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, resolve(__dirname, '../config'), 'VITE_')

  // The framework ships with an empty config/cities.json - the app itself
  // fails loudly at runtime (frontend/src/cities.ts), but that only shows
  // up in the browser console. Warn here too so `make dev`/`make build`
  // surfaces it immediately in the terminal instead.
  const citiesJsonPath = resolve(__dirname, '../config/cities.json')
  if (existsSync(citiesJsonPath)) {
    const registry = JSON.parse(readFileSync(citiesJsonPath, 'utf-8'))
    if (!registry.cities?.length) {
      console.warn(
        '\n⚠️  config/cities.json has no cities configured yet - the app will fail to load.\n' +
        '   Try a working example: make use-example COUNTRY=spain (or COUNTRY=burkina-faso)\n' +
        '   Or add your own: make add-city ARGS="--city ... --country ... ..."\n',
      )
    }
  }

  return {
    envDir: resolve(__dirname, '../config'),
    plugins: [
      {
        // Serves ../data/cities/ at /data in dev so the frontend resolves
        // city data files (stops.json, pois.json, etc.) from the new repo
        // layout without a symlink (cross-platform, no fs tricks needed).
        name: 'serve-city-data',
        configureServer(server) {
          const citiesDir = resolve(__dirname, '../data/cities')
          server.middlewares.use('/data', (req, res, next) => {
            const filePath = join(citiesDir, req.url ?? '/')
            let stat
            try {
              stat = statSync(filePath)
              if (!stat.isFile()) return next()
            } catch {
              return next()
            }
            const mime = { '.json': 'application/json', '.bin': 'application/octet-stream', '.pmtiles': 'application/octet-stream' }
            res.setHeader('Content-Type', mime[extname(filePath)] ?? 'application/octet-stream')
            res.setHeader('Accept-Ranges', 'bytes')
            const range = req.headers['range']
            if (range) {
              const [, s, e] = range.match(/bytes=(\d+)-(\d*)/) ?? []
              const start = parseInt(s, 10)
              const end = e ? parseInt(e, 10) : stat.size - 1
              res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`)
              res.setHeader('Content-Length', end - start + 1)
              res.statusCode = 206
              createReadStream(filePath, { start, end }).pipe(res)
            } else {
              res.setHeader('Content-Length', stat.size)
              createReadStream(filePath).pipe(res)
            }
          })
        },
      },
      {
        // Deployment-owned theme overrides (config/theme.css - color/font
        // custom-property re-declarations layered after tokens.css, see
        // config/theme.css.example) as a virtual module, so it's never a
        // hard import error when the file doesn't exist - the framework
        // itself ships none, only deployments create one. The .css suffix
        // on the virtual id matters: it's what makes Vite's own CSS
        // pipeline (injection in dev, extraction in build) apply to it,
        // the same as importing a real .css file would.
        name: 'deployment-theme',
        resolveId(id) {
          if (id === 'virtual:deployment-theme.css') return '\0virtual:deployment-theme.css'
        },
        load(id) {
          if (id !== '\0virtual:deployment-theme.css') return
          const themePath = resolve(__dirname, '../config/theme.css')
          if (existsSync(themePath)) {
            this.addWatchFile(themePath)
            return readFileSync(themePath, 'utf-8')
          }
          return '/* no config/theme.css in this deployment */'
        },
      },
      {
        // Injects <link rel="preload"> for the critical Plus Jakarta Sans weights
        // at build time, using the actual content-hashed filenames from the bundle.
        // Reduces FOUT and helps LCP on text-heavy first paints.
        name: 'preload-fonts',
        transformIndexHtml: {
          order: 'post',
          handler(html, ctx) {
            if (!ctx.bundle) return html
            const links = Object.keys(ctx.bundle)
              .filter(f => /plus-jakarta-sans-latin-(600|700|800)-normal.*\.woff2$/.test(f))
              .map(f => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/${f}">`)
            if (!links.length) return html
            return html.replace('</head>', `    ${links.join('\n    ')}\n  </head>`)
          },
        },
      },
      {
        // Injects the Umami analytics script tag at build time using env vars.
        // Uses a plain <script defer> so no inline code is needed and the
        // existing CSP (script-src https://analytics.${DOMAIN}, see
        // deploy/nginx/default.conf.template) covers it.
        // Skipped entirely when VITE_ANALYTICS_URL or VITE_ANALYTICS_WEBSITE_ID is empty.
        name: 'inject-analytics',
        transformIndexHtml(html) {
          const url = env.VITE_ANALYTICS_URL
          const id  = env.VITE_ANALYTICS_WEBSITE_ID
          if (!url || !id) return html
          const tag = `<script defer src="${url}/script.js" data-website-id="${id}"></script>`
          return html.replace('</head>', `  ${tag}\n</head>`)
        },
      },
      vue(),
      // Precompiles the messages from src/i18n/locales/*.json at build time
      // and drops the message compiler from the bundle (~6KB gzip less) -
      // our messages are static JSON, never generated/edited at runtime, so
      // there's no need to compile them in the browser. Confirmed with
      // rollup-plugin-visualizer that without runtimeOnly + dropMessageCompiler,
      // @intlify/core-base still drags in the compiler even when vue-i18n is
      // aliased to its "runtime" build.
      //
      // Build only (not dev): with Vite 8.1.0 + dropMessageCompiler, keys
      // added/renamed in fr.json/en.json after starting `vite dev` don't
      // resolve in the browser (the served JSON has them fine, but the
      // runtime doesn't use them) - persists even after restarting the
      // server and deleting node_modules/.vite, so it isn't a caching issue.
      // In dev we use the full compiler (heavier, but doesn't matter on
      // localhost) so new keys work without restarting anything.
      VueI18nPlugin({
        include: [fileURLToPath(new URL('./src/i18n/locales/**', import.meta.url))],
        runtimeOnly: command === 'build',
        dropMessageCompiler: command === 'build',
      }),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'script-defer',
        includeAssets: ['logo/icon.svg'],
        manifest: {
          name:             env.VITE_APP_NAME,
          short_name:       env.VITE_APP_NAME,
          description:      env.VITE_APP_DESCRIPTION,
          lang:             env.VITE_DEFAULT_LOCALE ?? 'fr',
          theme_color:      env.VITE_THEME_COLOR ?? '#0a5c3f',
          background_color: env.VITE_PWA_BACKGROUND_COLOR ?? '#ffffff',
          display:          'standalone',
          start_url:        '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // New SW activates immediately on install so users aren't stuck
          // behind a stale SW after a new deploy. clientsClaim() makes the
          // new SW take control of open pages immediately after activation.
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: '/index.html',
          // Exclude the routing API path from the navigation fallback so the
          // service worker doesn't intercept it and return index.html.
          navigateFallbackDenylist: [/^\/routing/],
          globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
          // stops.json/pois.json live in public/data/ and are fetched on
          // demand (see useLocalStops.js/useDestinationSearch.js). They are
          // not bundled as JS chunks so they don't appear in globPatterns.
          // Cached at runtime via the city-data rule below.
          // pattern-tile.png/.webp (Liste's decorative background, see
          // base.css .pattern-tile-bg): not critical for first paint, and
          // precaching both would defeat the point of having a webp
          // default + png fallback - most installs would only ever need
          // the webp. Excluded here, cached on first real request (see
          // runtimeCaching below).
          globIgnores: [
            '**/pattern-tile.*',
            // URL-only pages no regular user ever opens — exclude from SW install
            // to save ~47KB of precache bandwidth on every first install.
            // They still load fine from the network on first visit (content-hashed).
            '**/StyleguideView-*',
            '**/AdminView-*',
          ],
          runtimeCaching: [
            {
              // Routing API: never cache-first, itineraries must be fresh.
              // NetworkFirst with a short timeout; 5-min fallback for
              // when the network is completely unavailable.
              urlPattern: /\/routing\/plan/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'routing-api',
                networkTimeoutSeconds: 6,
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 },
              },
            },
            {
              // Per-city stops.json/pois.json served from /data/. Files are
              // not content-hashed; nginx sets max-age=86400 and a new deploy
              // invalidates them naturally via the rsync + version.json flow.
              urlPattern: /\/data\/[^/]+\/(stops|pois)\.json$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'city-data',
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
            {
              // pattern-tile.png/.webp (see globIgnores note above): not
              // content-hashed, so if the artwork ever changes, rename the
              // file rather than relying on cache invalidation here.
              urlPattern: /\/images\/pattern-tile\.(webp|png)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'pattern-bg',
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 4 },
              },
            },
            {
              // MapLibre GL glyphs (Noto Sans font .pbf tiles) from OpenFreeMap
              // CDN. CacheFirst: glyph files are content-addressed by font
              // name + unicode range — they never change. After the first map
              // interaction, labels work offline without touching the network.
              urlPattern: /^https:\/\/tiles\.openfreemap\.org\/fonts\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'map-glyphs',
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              // OSRM foot-routing geometry (walk leg polylines) — results are
              // deterministic per coordinate pair and stable, so CacheFirst with
              // a 30-day TTL avoids a redundant network call on repeat searches.
              urlPattern: /^https:\/\/routing\.openstreetmap\.de\/routed-foot\//,
              handler: 'CacheFirst',
              options: {
                cacheName: 'osrm-walk',
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              // routes.json and routes-meta.json per city. routes.json is
              // fetched by LineView (full geometry for map display) and offline
              // routing; routes-meta.json is fetched by StopView (stop list
              // only, no geometry — 5-10x smaller). Both are stable between
              // deploys, so CacheFirst with a 7-day TTL is safe.
              urlPattern: /\/data\/[^/]+\/routes(?:-meta)?\.json$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'city-routes',
                cacheableResponse: { statuses: [200] },
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // Allows imports from outside frontend/: config/cities.json (city
      // registry shared with pipeline/cities.py) and data/cities/ (city
      // data files served by the dev middleware above).
      fs: {
        allow: ['../config', '../data', '..'],
      },
      proxy: {
        '/routing': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
