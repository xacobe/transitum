# Transitum

Progressive web app framework for public transit: explore nearby stops, browse lines, and plan multi-leg trips — offline and tuned to run on 2G/3G connections and low-end phones, for any city.

Ships with no city pre-configured — `config/cities/` is empty by default. Two working examples live under `examples/`: `spain/` (Bilbao, official-GTFS pattern, multi-source — four operators merged across bus/metro/tram/funicular) and `burkina-faso/` (Ouagadougou/Koudougou/Bobo-Dioulasso, OSM-synthetic pattern) — both drop in with one command.

Designed for the constraints of low-connectivity deployments: 2G/3G connections, expensive data, and no published real-time timetables from most operators. Configuration for a new region is possible through a single `.env` file and a city registry, no code changes.

**📖 Full documentation: [xacobe.github.io/transitum](https://xacobe.github.io/transitum/)**

---

## Features

- **Nearby stops** — closest bus stops on an interactive map and in a list view
- **Route planning** — multi-leg itineraries with walking segments, up to 5 Pareto-optimal alternatives; advanced search for a specific date/time, weekday-aware (Mon-Fri/Saturday/Sunday) both online and offline
- **Line browser** — full line list with route map and stop timeline for each direction
- **Offline mode** — city pack (vector map tiles, routing binaries, stop list, POIs) works fully offline after first load
- **Real or estimated timetables** — actual next-departure times where a schedule is published, a frequency estimate otherwise, per line
- **Multi-modal filtering** — filter by transport mode (bus, metro, tram, rail, ferry, ...) when a city has more than one
- **Multi-city, multi-language, light/dark theme, favorites, incident reports**

See the [documentation site](https://xacobe.github.io/transitum/guide/) for the full feature list and architecture.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 + TypeScript, Vite, Pinia |
| Map rendering | MapLibre GL JS + PMTiles (vector tiles, no tile server) |
| Routing algorithm | Minotor / RAPTOR (Node.js, custom binary format, runs client-side or server-side) |
| Reports backend | PocketBase |
| Analytics | Umami (self-hosted, cookieless) |
| Data source | OpenStreetMap + Overpass API, or an operator's official GTFS feed |

## Quick start

**Prerequisites:** Node.js 22+, Python 3.12+, Docker

```bash
cp config/.env.example config/.env
make install
make use-example COUNTRY=spain    # config/cities/ ships empty — this drops in a working city
make dev                           # → http://localhost:5173
docker compose --env-file config/.env up routing-serve   # separately, for offline/online routing
```

→ [Quick start](https://xacobe.github.io/transitum/guide/quick-start) for the full version, including trying the other example.

## Documentation

The full documentation lives at **[xacobe.github.io/transitum](https://xacobe.github.io/transitum/)**:

- **[Guide](https://xacobe.github.io/transitum/guide/)** — architecture, offline caching, POI search, repository layout.
- **[Adding a city](https://xacobe.github.io/transitum/cities/)** — OSM-synthetic vs. official GTFS, merging several operators' feeds, generating map tiles, a full worked example (Bilbao).
- **[Pipeline reference](https://xacobe.github.io/transitum/pipeline/)** — every script, the city config schema, generated data files.
- **[Deployment](https://xacobe.github.io/transitum/deployment/)** — running your own instance, theming/extending it, staying in sync with framework updates via `git merge upstream/main`.
- **[Contributing](https://xacobe.github.io/transitum/contributing/)** — known tech debt, PR conventions.

## License

[AGPL-3.0](LICENSE).
