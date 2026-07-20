# Repository layout

```
config/
├── .env.example          ← copy to .env and fill in — single deployment config entry point
└── cities/               ← city registry: one <slug>.json per city (coordinates, agency config,
                             schedule constants) + _countries.json (shared country registry,
                             default city) — empty by default. *.example.jsonc are reference
                             copies (both supported city patterns, fully commented, not parsed)

examples/
├── spain/                ← official-GTFS pattern, multi-source (Bilbao: 4 operators, 4 modes)
└── burkina-faso/         ← OSM-synthetic pattern, three cities

data/
├── cities/<city>/        ← app-ready outputs (versioned except .bin and .pmtiles)
│   ├── stops.json            stop list
│   ├── routes.json           line geometries + stop sequences
│   ├── routes-meta.json      line metadata (no geometry, for stop panels)
│   ├── pois.json             named places with tier field
│   ├── version.json          data version stamp (cache invalidation)
│   ├── timetable.bin         Minotor routing binary (gitignored, regenerate locally)
│   ├── stops.bin              Minotor stops binary (gitignored, regenerate locally)
│   └── tiles.pmtiles         vector map tiles (gitignored, regenerate locally)
├── gtfs/<country>/<city>/  ← versioned synthetic GTFS source files (hand-curated from OSM)
└── .cache/               ← downloaded OSM PBFs + generated GTFS zips (gitignored)

pipeline/                 ← data generation scripts (Python + Node), npm workspace member
├── use_example.py            copies an examples/<name>/ fixture into config/cities/ + data/
├── add_city.py                queries Nominatim, writes a starter config/cities/<slug>.json
├── osm_to_gtfs.py            OSM relations → synthetic GTFS
├── import_gtfs.py            downloads + remaps a single official GTFS feed
├── import_gtfs_multi.py      merges several official GTFS feeds (see Adding a city → Multi-source)
├── osm_to_pois.py            OSM → pois.json
├── gtfs_stops_to_json.py     GTFS stops → stops.json
├── gtfs_routes_to_json.py    GTFS + OSM shapes → routes.json + routes-meta.json
├── generate_transit_data.mjs GTFS zip → timetable.bin + stops.bin (Minotor)
├── generate_pmtiles.py       OSM PBF → tiles.pmtiles (Planetiler)
├── check_osm_routes.py       CI: detects OSM route changes since last sync
├── cities.py                 shared path utilities + city registry loader
└── package.json               declares 'minotor' (also frontend's dependency - see root package.json)

frontend/                 ← Vue 3 + TypeScript PWA, npm workspace member
├── src/
│   ├── views/                one file per screen
│   ├── components/
│   ├── composables/
│   ├── stores/               Pinia stores
│   ├── services/             search index, routing client, PocketBase client
│   ├── i18n/locales/         es.json + fr.json + en.json
│   └── styles/               design tokens + global base styles
├── vite.config.js            envDir → config/, dev middleware for /data
└── public/                   favicon, icons, images

services/
├── routing/              ← Node.js Minotor/RAPTOR routing server (POST /routing/plan)
└── pocketbase/           ← PocketBase service (reports backend)

deploy/
└── nginx/default.conf.template  ← reverse proxy, HTTPS, rate limiting, caching headers (${DOMAIN} templated)

docs/                     ← this documentation site (VitePress), npm workspace member

.github/workflows/
├── ci.yml                ← typecheck + build on every PR
├── data-sync-routes.yml  ← daily: detects OSM changes → regenerates GTFS → deploys
├── data-sync-pois.yml    ← monthly: regenerates POIs → deploys
└── docs-deploy.yml       ← on push to docs/: builds and publishes this site to GitHub Pages

Makefile                  ← dev/build/data/deploy targets (start here)
docker-compose.yml
package.json               ← npm workspaces root (frontend/ + pipeline/ + docs/ share one
                              node_modules; services/routing/ stays a separate, non-workspace
                              project, installed inside its own Docker image instead)
```
