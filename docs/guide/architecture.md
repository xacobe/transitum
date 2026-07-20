# Architecture

Transitum is four pieces that only talk to each other over static files and
one small HTTP API:

- **`frontend/`** — Vue 3 + TypeScript PWA. Reads city data as static JSON
  and binary files; never queries a database directly.
- **`pipeline/`** — Python (+ a couple of Node scripts) that turns either
  OSM tags or a GTFS feed into the static files the frontend reads:
  `routes.json`, `stops.json`, `pois.json`, Minotor routing binaries, and
  PMTiles vector map tiles.
- **`services/routing/`** — a small Node HTTP service running the same
  Minotor (RAPTOR) routing engine as the frontend's offline path, for
  clients that haven't downloaded a city's offline pack yet, or that don't
  support running it client-side.
- **PocketBase** — the only real "backend," used solely for user-submitted
  issue reports (wrong stop, changed route, ...).

## Data flow

```
OSM tags  ─┐
           ├─→ pipeline/*.py ─→ data/cities/<slug>/*.json, *.bin, *.pmtiles ─→ frontend
GTFS feed ─┘
```

Nothing in the frontend or routing service ever talks to Overpass, a GTFS
URL, or Nominatim directly — those are pipeline-time concerns. At runtime,
a city is just a directory of static files plus one entry in
`config/cities/`.

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

## Next

- [Offline architecture](/guide/offline-architecture) — the two caching
  layers and online-vs-offline routing.
- [POI search](/guide/poi-search) — how destination search is indexed.
- [Repository layout](/guide/repository-layout) — every directory, what it
  owns.
