# Transitum

Progressive web app framework for public transit. Answers two questions: **"which bus stops near me?"** and **"how do I get from A to B?"**

Ships with no city pre-configured — `config/cities.json` is empty by default. Two working examples live under `examples/`: `spain/` (Vigo, official-GTFS pattern) and `burkina-faso/` (Ouagadougou/Koudougou/Bobo-Dioulasso, OSM-synthetic pattern) — both drop in with one command, see [Trying it out](#trying-it-out).

Designed for the constraints of low-connectivity deployments: 2G/3G connections, expensive data, and no published real-time timetables from most operators. Configuration for a new region is possible through a single `.env` file and a city registry, no code changes.

---

## Features

- **Nearby stops** — closest bus stops on an interactive map and in a list view
- **Route planning** — multi-leg itineraries with walking segments, up to 5 Pareto-optimal alternatives
- **Line browser** — full line list with route map and stop timeline for each direction
- **Favorites** — saved stops and itineraries, persisted locally
- **Offline mode** — city pack (vector map tiles, routing binaries, stop list, POIs) works fully offline after first load
- **Real or estimated timetables** — shows actual next-departure times for lines with a published schedule, falls back to a "Frequent / Infrequent" estimate for OSM-synthetic cities with no real timetable, per line (a single city/feed can mix both)
- **Multi-city** — city auto-detected by GPS on first launch; switchable manually from Settings
- **Multi-language UI** — full i18n (`frontend/src/i18n/locales/`), each deployment picks its own default and active subset via `.env`
- **Light / dark theme**
- **Incident reports** — contextual report button on stops and lines, backed by PocketBase

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript, Vite, Pinia |
| Map rendering | MapLibre GL JS (vector tiles) |
| Tile format | PMTiles (self-contained archive, no tile server) |
| Client-side search | MiniSearch (in-memory full-text index) |
| Routing algorithm | Minotor / RAPTOR (Node.js, custom binary format) |
| i18n | Vue i18n (es / fr / en shipped; add more per-locale JSON files as needed) |
| Reports backend | PocketBase (SQLite, REST API) |
| Analytics | Umami (self-hosted, cookieless) |
| Tile generation | Planetiler (Java, runs locally) |
| Data source | OpenStreetMap + Overpass API |

---

## Repository layout

```
config/
├── .env.example          ← copy to .env and fill in — single deployment config entry point
├── cities.json           ← city registry: coordinates, agency config, schedule constants (empty by default)
└── cities.example.jsonc  ← reference copy: both supported city patterns, fully commented (not parsed)

examples/
├── spain/                ← official-GTFS pattern, one city (Vigo) — `make use-example COUNTRY=spain`
└── burkina-faso/         ← OSM-synthetic pattern, three cities — `make use-example COUNTRY=burkina-faso`

data/
├── cities/<city>/        ← app-ready outputs (versioned except .bin and .pmtiles)
│   ├── stops.json            stop list
│   ├── routes.json           line geometries + stop sequences
│   ├── routes-meta.json      line metadata (no geometry, for stop panels)
│   ├── pois.json             ~3 400 named places with tier field
│   ├── version.json          data version stamp (cache invalidation)
│   ├── timetable.bin         Minotor routing binary (gitignored, regenerate locally)
│   ├── stops.bin             Minotor stops binary (gitignored, regenerate locally)
│   └── tiles.pmtiles         vector map tiles (gitignored, regenerate locally)
├── gtfs/<country>/<city>/  ← versioned synthetic GTFS source files (hand-curated from OSM)
└── .cache/               ← downloaded OSM PBFs + generated GTFS zips (gitignored)

pipeline/                 ← data generation scripts (Python + Node), npm workspace member
├── use_example.py            merges an examples/<name>/ fixture into config/cities.json + data/
├── add_city.py                queries Nominatim, appends a starter entry to config/cities.json
├── osm_to_gtfs.py            OSM relations → synthetic GTFS
├── import_gtfs.py            downloads + remaps an official GTFS feed (alternative to osm_to_gtfs.py)
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
│   ├── i18n/locales/         fr.json + en.json
│   └── styles/               design tokens + global base styles
├── vite.config.js            envDir → config/, dev middleware for /data
└── public/                   favicon, icons, images

services/
├── routing/              ← Node.js Minotor/RAPTOR routing server (POST /routing/plan)
└── pocketbase/           ← PocketBase service (reports backend)

deploy/
└── nginx/default.conf.template  ← reverse proxy, HTTPS, rate limiting, caching headers (${DOMAIN} templated)

.github/workflows/
├── ci.yml                ← typecheck + build on every PR
├── data-sync-routes.yml  ← daily: detects OSM changes → regenerates GTFS → deploys
└── data-sync-pois.yml    ← monthly: regenerates POIs → deploys

Makefile                  ← dev/build/data/deploy targets (start here)
docker-compose.yml
package.json               ← npm workspaces root (frontend/ + pipeline/ share one node_modules -
                              see pipeline/package.json's note above; services/routing/ stays a
                              separate, non-workspace project, installed inside its own Docker
                              image instead)
```

---

## Quick start

**Prerequisites:** Node.js 22+, Python 3.12+, Docker

```bash
cp config/.env.example config/.env   # fill in secrets (see .env.example for all vars)
make install                          # npm ci at the repo root (npm workspaces: frontend + pipeline)
make use-example COUNTRY=spain        # config/cities.json ships empty — this drops in a working city
make dev                              # frontend dev server → http://localhost:5173
```

The dev server proxies `/routing/*` to the Docker routing service. Start it with:

```bash
docker compose --env-file config/.env up routing-serve
```

### Trying it out

`config/cities.json` is empty by default — no city, no bundled transit data. The fastest way to see the app working:

```bash
make use-example COUNTRY=spain             # one city, real official GTFS schedules
make use-example COUNTRY=burkina-faso      # three cities, OSM-reconstructed schedules
make use-example COUNTRY=burkina-faso CITY=ouagadougou   # just one city from a multi-city example
```

Each copies a ready-to-use city entry into `config/cities.json` plus its pre-generated GTFS/JSON data into `data/` — no OSM or live-GTFS fetch needed. See `examples/<country>/README.md` for what each one demonstrates. To add a real city instead, see [Adding a new city](#adding-a-new-city).

---

## Updating from upstream

A deployment is a normal `git clone` of this repo, not a fork of a published
package — you get framework improvements by merging, the same way you'd
merge any other branch.

### First-time setup

```bash
git clone <this-repo-url> my-deployment
cd my-deployment
git remote rename origin upstream    # this repo becomes "upstream"...
git remote add origin <your-own-repo-url>   # ...and your own repo becomes "origin"
```

### Pulling updates later

```bash
git fetch upstream
git merge upstream/main
```

This only stays conflict-free as long as your own commits and the
framework's own commits never touch the same files — see the ownership
table below. If `git merge` reports a conflict in a framework-owned file,
that's a signal you (or a previous contributor) edited something you
shouldn't have; resolve it in favor of upstream and move whatever you
needed into a deployment-owned file instead (`config/theme.css`,
`docker-compose.override.yml`, etc.)

### What's yours vs. what's the framework's

| | Owned by your deployment | Owned by the framework |
|---|---|---|
| **City data** | `config/cities.json`, `data/` | `config/*.example.*`, `examples/` |
| **Secrets/config** | `config/.env*` (except `.env.example`) | `config/.env.example` |
| **Styling** | `config/theme.css` | `frontend/src/styles/tokens.css`, everything else under `frontend/src/` |
| **Branding assets** | `frontend/public/logo/`, `frontend/public/icons/` (generated by `make icons` from `VITE_THEME_COLOR`, not committed by the framework) | — |
| **Behavior** | `frontend/src/custom/` (extra routes/nav items/backends - copy `custom/index.example.ts` to `custom/index.ts` to activate) | `frontend/src/customization/`, `frontend/src/custom/index.example.ts` |
| **Infra tweaks** | `docker-compose.override.yml` (gitignored — the sanctioned way to add/change services, ports, volumes per-deployment without touching `docker-compose.yml` itself) | `docker-compose.yml`, `deploy/nginx/default.conf.template` |
| **Everything else** | — | `pipeline/`, `Makefile`, `package.json` / `pipeline/package.json`, `.github/workflows/` |

Rule of thumb: if it's under version control in *this* repo already and
isn't one of the `.example`/`.override` escape hatches above, treat it as
framework-owned — edit it upstream (send a PR) rather than in your own
deployment, or every future `git merge upstream/main` will conflict on it
again. See [Theming and extending a deployment](#theming-and-extending-a-deployment)
below for the two sanctioned ways to customize behavior/appearance without
touching framework files at all.

---

## Data pipeline

All pipeline scripts take `--city <slug>`. Available slugs are defined in `config/cities.json`.

Regenerate all data for one city — two variants depending on where the city's transit data comes from (see [Adding a new city](#adding-a-new-city)):

```bash
make data CITY=your-city                                              # OSM-synthetic
make import-gtfs CITY=your-city URL=https://example.org/gtfs.zip      # official GTFS feed
```

`make data` runs, in order:
1. `pipeline/osm_to_gtfs.py` — OSM relations → synthetic GTFS in `data/gtfs/`
2. `pipeline/gtfs_routes_to_json.py` — GTFS + OSM → `data/cities/<city>/routes.json`
3. `pipeline/gtfs_stops_to_json.py` — GTFS stops → `data/cities/<city>/stops.json`
4. `pipeline/osm_to_pois.py` — OSM Overpass → `data/cities/<city>/pois.json`
5. `npm run generate-transit-data` — GTFS → `timetable.bin` + `stops.bin`

`make import-gtfs` replaces step 1 with `pipeline/import_gtfs.py` (downloads and remaps agency IDs on the official feed instead) and runs the same steps 2–5 (exposed on their own as `make data-common CITY=<city>`).

Regenerate POIs for all active cities (from `VITE_CITIES` in `config/.env`):

```bash
make pois
```

Generate vector map tiles (requires Java 17+ and the OSM PBF at `data/.cache/`):

```bash
make tiles CITY=your-city
```

---

## POI search

Destination search is fully local — bus stops + POIs are indexed in a single MiniSearch pass on the device. No external geocoder. Works offline.

POIs come from `pois.json` (~135 KB gzipped in the Vigo example, ~5 700 places) generated from OpenStreetMap. Each POI has a `tier` field used for relevance ranking:

| Tier | Contents | OSM keys |
|---|---|---|
| 1 | Hospitals, clinics, markets, universities, neighbourhoods, transit stations | `amenity`, `place`, `healthcare=hospital` |
| 2 | Banks, pharmacies, schools, hotels, fuel, police, libraries, parks, museums, historic sites, government buildings | `amenity`, `tourism`, `leisure`, `historic`, `healthcare`, `government` |
| 3 | Shops, restaurants, offices, worship, leisure, remaining amenities | `shop`, `office`, `amenity`, `tourism`, `leisure`, `healthcare` |

The `data-sync-pois.yml` workflow regenerates and deploys `pois.json` for all cities on the 1st of each month.

---

## Offline architecture

The app has two layers of caching with distinct download moments.

### Layer 1 — App shell (automatic, on first visit)

The Service Worker caches the full app bundle on first load: all JS/CSS/HTML chunks, the Minotor WASM binary (the routing algorithm), and static assets. No user action needed. After this, the app UI works without a network connection.

### Layer 2 — City pack (explicit, user-triggered from Settings)

When the user taps "Download city", the following files are fetched and stored locally, in this order:

| File | Size | Storage | Purpose |
|---|---|---|---|
| `tiles.pmtiles` | 4–80 MB | IndexedDB (Blob) | Vector map tiles — the map works offline |
| `routes.json` | ~1 MB | Cache API | Line geometries for the map and offline routing |
| `routes-meta.json` | ~300 KB | Cache API | Line metadata for stop detail panels |
| `stops.json` | ~200 KB | Cache API | Stop list, warmed for offline search |
| `pois.json` | ~90 KB | Cache API | Points of interest, warmed for offline search |
| `timetable.bin` | ~200 KB | IndexedDB | Minotor routing binary (trip/stop graph) |
| `stops.bin` | ~60 KB | IndexedDB | Minotor stop coordinates binary |
| Noto Sans glyphs | ~2 MB | Cache API | Map label fonts from OpenFreeMap CDN |

The progress bar tracks only `tiles.pmtiles` (the dominant size). The other files download in parallel after the tiles complete.

### Routing: online vs offline

| State | Routing path | Server call? |
|---|---|---|
| City pack downloaded | WASM (Minotor) reads local `timetable.bin` + `stops.bin` | No — saves mobile data |
| No city pack | POST `/routing/plan` to the Node.js server | Yes |

When local data is present, **the WASM is preferred even when online** — same algorithm, same GTFS source, same result quality, but no round-trip. The Node.js routing service only handles users who haven't downloaded the city pack.

Data updates (`version.json` freshness check) are detected in the background. If the server has regenerated transit data since the last download, a "Update available" notice appears in Settings — tapping it re-downloads only `timetable.bin`, `stops.bin`, `routes.json`, and `routes-meta.json` (not the tiles, which rarely change).

---

## Deployment

Node/npm are not on the server — build always runs locally, then synced over.
The example commands below use `~/app` as the remote project directory -
pick whatever you like, it just needs to match wherever you clone this repo
on the server. The CI workflows (`.github/workflows/data-sync-*.yml`) read
the same path from a `DEPLOY_PATH` repository variable (Settings → Actions →
Variables), defaulting to `~/app` too if unset - set it once there instead
of editing the workflow files.

### Frontend changes

```bash
make build
rsync -az --delete frontend/dist/  root@<server>:~/app/frontend/dist/
rsync -az            data/cities/   root@<server>:~/app/data/cities/
ssh root@<server> 'cd ~/app && docker compose restart web'
```

### Routing service changes

```bash
rsync -az services/routing/ root@<server>:~/app/services/routing/
ssh root@<server> 'cd ~/app && docker compose build routing-serve && docker compose up -d routing-serve'
```

### nginx config changes

`deploy/nginx/default.conf.template` is rendered by nginx's own entrypoint
on container start (`${DOMAIN}` from `config/.env` - see the template's
header comment), so a config change just needs a restart, not a rebuild:

```bash
rsync deploy/nginx/default.conf.template root@<server>:~/app/deploy/nginx/default.conf.template
ssh root@<server> 'cd ~/app && docker compose restart web'
```

### PocketBase admin UI

The PocketBase admin interface (`/_/`) is never exposed publicly — nginx only proxies `/pb/api/`. Access it via SSH tunnel:

```bash
ssh -L 8090:localhost:8090 root@<server>
# then open http://localhost:8090/_/ in your browser
```

---

## Adding a new city

The framework is designed so that adding a city only requires data work — no code changes.

### 0. Check for an official GTFS feed first

Transit data (stops/routes/timetable — not POIs, which always come from OSM) can come from either of two sources; see `config/cities.example.jsonc` for a fully-commented example of both:

- **Official GTFS** (preferred when it exists) — the operator or the city/region's open-data portal publishes a real feed with actual schedules. Far more complete than anything reconstructed from OSM tags: real timetables instead of an estimated frequency, and full line coverage instead of whatever happens to be tagged in OSM. Look for one at the city/region's open-data portal, a national access point (EU operators are required to publish to one), or a feed catalog like [mobilitydatabase.org](https://mobilitydatabase.org) or [transit.land](https://transit.land). If you find one, skip to **step 4b** below.
- **OSM-synthetic** (fallback) — no agency publishes a feed, so the topology is reconstructed from OSM route relation tagging (`route=bus` relations) and schedules are a hand-configured frequency estimate. Coverage is only as good as OSM's tagging for that city/network — can be significantly incomplete for cities with light OSM transit mapping.

### 1. Generate the city block

`make add-city` queries Nominatim for the city's coordinates and bounding box, appends a starter entry to `config/cities.json`, and adds the slug to `VITE_CITIES` in `config/.env`:

```bash
make add-city ARGS="--city Dakar --country Senegal --timezone Africa/Dakar --agency-name DDD"
```

If the slug already exists in `cities.json` the script exits with an error — edit the file directly to update an existing city.

All available flags:

| Flag | Required | Default |
|---|---|---|
| `--city` | yes | — |
| `--country` | yes | — |
| `--timezone` | yes | — |
| `--agency-name` | yes | — |
| `--slug` | no | auto-derived from city name |
| `--agency-url` | no | `""` |
| `--agency-lang` | no | `fr` |
| `--service-start` | no | `06:00:00` |
| `--service-end` | no | `20:00:00` |

### 2. Review and adjust `config/cities.json`

Open `config/cities.json` and find the new entry at the end of `"cities"`. Fields to review:

- **`country`** — set to a key in the `"countries"` object at the top of the file. Add a new entry there if needed.
- **`serviceStart` / `serviceEnd`** and **`frequencyPeriods`** — adjust to match actual local transit hours and headways. The generated values are generic defaults.
- **`agencies`** — update `agencyUrl` if known.

Fields marked `(post-pipeline)` in the schema reference should be left at their defaults and filled in after step 4.

### 3. Set the Geofabrik URL for the country (if new)

`make tiles` needs a country-level `.osm.pbf` file to generate vector tiles. If the country already exists in `config/cities.json` with a `geofabrikUrl`, this step is done — the file is downloaded automatically on first run.

For a new country, add `geofabrikUrl` to its entry under `"countries"` in `cities.json`:

```json
"senegal": {
  "displayName": "Senegal",
  "countryCode": "SN",
  "geofabrikUrl": "https://download.geofabrik.de/africa/senegal-latest.osm.pbf"
}
```

Find the URL for any country at [download.geofabrik.de](https://download.geofabrik.de). You can also pass `--geofabrik-url` to `make add-city` and the instructions will include the exact line to add.

If you prefer to download manually, place the file at `data/.cache/<country-slug>-latest.osm.pbf`.

### 4a. Run the data pipeline (OSM-synthetic)

```bash
make data CITY=your-city
```

This generates all data files in `data/cities/your-city/` — stops, routes, POIs, and routing binaries. The first run queries Overpass API; expect a few minutes for a large city.

After the pipeline runs, check its output for warnings about duplicate relation IDs or unrecognized `ref=` tags. If any appear, fill in `duplicateRelationIds` and `refAliases` under `osmPatches` in the city's `cities.json` entry, then re-run. If the area also happens to catch relations that are geographically in-scope but not actually part of this city's network — a same-named place elsewhere in the world (Overpass area name matching isn't unique — e.g. "Vigo" matched both the Galician city and a village in Kent, England), or a legitimate but out-of-scope intercity/regional coach line that just happens to pass through — list their relation IDs under `excludeRelationIds` in the same object and re-run.

### 4b. Run the data pipeline (official GTFS)

```bash
make import-gtfs CITY=your-city URL=https://example.org/opendata/gtfs.zip
```

Downloads the feed, remaps its `agency_id`(s) to the ones declared under `agencies` (matched by order — the common case is one agency on each side; the script exits with an error asking you to map them by hand if the counts don't match), and runs the same routes/stops/POIs/binaries steps as 4a. Add a `transitSource` object to the city's entry recording `"type": "official-gtfs"` and the feed `url`, so it's clear later where the data came from and where to re-fetch it — see `config/cities.example.jsonc`.

Some feeds only cover a short rolling calendar window (check `calendar_dates.txt`'s date range after importing) — if so, plan to re-run `make import-gtfs` periodically to keep it current; there's no automated resync workflow for this path yet (unlike `data-sync-routes.yml` for the OSM path).

### 5. Generate vector map tiles

Requires Java 17+. The first run downloads Planetiler (~150 MB, one-time):

```bash
make tiles CITY=your-city
```

Output: `data/cities/your-city/tiles.pmtiles` (~20–80 MB depending on city size). Once generated, update `offlineMb` in `cities.json` to match the file size in megabytes.

### 6. Build and deploy

```bash
make build
make deploy
```

The frontend and routing server pick up new cities automatically — no code changes needed.

---

## Theming and extending a deployment

The framework/deployment split (a deployment `git clone`s this repo, keeps
`upstream` as a second remote, and pulls improvements via
`git fetch upstream && git merge upstream/main`) only stays low-friction if
a deployment's own customizations never touch the same files the framework
itself commits to. Two different needs, two different answers:

**Restyling** — done, see `config/theme.css.example`. Copy it to
`config/theme.css` and override whichever CSS custom properties you want
(app colors, fonts, the MapLibre basemap palette) — loaded last via a Vite
virtual module, so the framework never needs to touch it and a fresh clone
with no `theme.css` just uses the defaults. See
`frontend/src/styles/tokens.css` for the full list of overridable tokens.

**Per-line colors** — each line's badge color resolves in this order: an
explicit override in `config/line-colors.json` (see
`config/line-colors.example.jsonc`), then the source GTFS's own official
`route_color` if the city opted in (`cities.json`'s `useOfficialLineColors`),
then a deterministic hash-based fallback palette so every line still gets a
stable, distinct color with zero configuration. `make line-colors CITY=slug`
seeds a starting entry per line (whatever color it shows today) into
`config/line-colors.json` — edit or delete whichever you want; re-running it
only ever fills in lines that don't have an entry yet, never touches what
you've already changed. Framework code never writes to this file after the
one-time seed, so it's yours to commit to your own `origin` like
`config/cities.json`.

**Adding behavior** (a new view, extra nav item, a different report/analytics
backend, …) — copy `frontend/src/custom/index.example.ts` to
`frontend/src/custom/index.ts` and fill in what you need:

```bash
cp frontend/src/custom/index.example.ts frontend/src/custom/index.ts
```

`custom/index.ts` is never read by the framework's own commits — it's your
file, commit it to your own `origin`. If it doesn't exist, the app behaves
exactly as if the file were empty; nothing is required to activate.

It exports one `defineCustomization({ ... })` call (see
`frontend/src/customization/contract.ts` for the full typed contract):

| Field | Adds |
|---|---|
| `routes` | Extra Vue Router routes, appended after the framework's own. Use lazy components (`() => import(...)`) — this module is bundled into the entry chunk. |
| `navItems` | Extra bottom-nav items, appended after the framework's 4. One extra item fits comfortably; more gets cramped on narrow screens. |
| `install(app)` | Runs once, after Pinia/router/i18n are installed and before the framework's own stores initialize — register extra Pinia plugins/stores or `mergeLocaleMessage()` here. |
| `analytics` | An extra sink that receives every `track()` call alongside Umami. To fully replace Umami, also leave `VITE_ANALYTICS_URL`/`VITE_ANALYTICS_WEBSITE_ID` empty. |
| `submitReport` | Replaces the default PocketBase report backend. The framework still owns the submitting/submitted/error UI around the call — throw to signal failure. Note the PocketBase-backed admin panel (`/administro`) reads straight from PocketBase, so a deployment that swaps `submitReport` owns its own report inbox. |

The `version: 1` field is the upgrade story: if a future framework release
needs a breaking change to this contract, it bumps the accepted version, and
your `custom/index.ts` fails typecheck right after the next
`git merge upstream/main` — loud, at build time — instead of breaking
silently at runtime.

Deliberately **not** a Drupal/WordPress-style hook-and-event system, and
deliberately **not** component shadowing (a same-path file silently
overriding a framework component) — this explicit, small, versioned export
surface is a stable contract across `upstream` merges; shadowing risks
silently diverging from a framework component that's since changed, with
nothing to flag it. A route name that collides with a framework route is
skipped with a console warning (dev only) rather than silently replacing
the framework view.

Named UI slots inside specific framework views (e.g. a `<slot>` in the stop
detail panel) are a smaller-grained version of the same idea, addable per
view only when a real need shows up — each one is an API the framework then
has to keep stable forever, so it's not worth pre-emptively sprinkling them
around.

---

## Analytics

Umami dashboard at whatever `VITE_ANALYTICS_URL` points to for your deployment — custom events for route searches, stop/line views, favorites, city changes.

To exclude your own browser from tracking:
```js
// In the browser console on your deployment's own domain
localStorage.setItem('umami.disabled', '1')
```

---

## Known tech debt

- **`useOfflineTiles.js`** — the only remaining `.js` file in `src/` (334 lines, 5 consumers). TypeScript conversion is pending: it requires writing Minotor WASM type definitions by hand before the file itself can be typed. No functional regression while it stays as JS; `tsconfig.json` has `allowJs: true`.
