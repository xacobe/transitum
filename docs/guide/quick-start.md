# Quick start

**Prerequisites:** Node.js 22+, Python 3.12+, Docker

```bash
cp config/.env.example config/.env   # fill in secrets (see .env.example for all vars)
make install                          # npm ci at the repo root (npm workspaces: frontend + pipeline)
make use-example COUNTRY=spain        # config/cities/ ships empty — this drops in a working city
make dev                              # frontend dev server → http://localhost:5173
```

The dev server proxies `/routing/*` to the Docker routing service. Start it
with:

```bash
docker compose --env-file config/.env up routing-serve
```

## Trying it out

`config/cities/` is empty by default — no city, no bundled transit data.
The fastest way to see the app working:

```bash
make use-example COUNTRY=spain             # Bilbao: 4 operators, 4 modes, real official GTFS schedules
make use-example COUNTRY=burkina-faso      # three cities, OSM-reconstructed schedules
make use-example COUNTRY=burkina-faso CITY=ouagadougou   # just one city from a multi-city example
```

Each copies a ready-to-use `<slug>.json` into `config/cities/` plus its
pre-generated GTFS/JSON data into `data/` — no OSM or live-GTFS fetch
needed. Bilbao's example also ships a pre-built `tiles.pmtiles`, so the map
renders immediately; the Burkina Faso cities don't, so their map falls back
to no basemap until you run `make tiles CITY=<slug>` separately. See
`examples/<country>/README.md` for what each one demonstrates.

To add a real city instead, see [Adding a city](/cities/).

## Updating from upstream

A deployment is a normal `git clone` of this repo, not a fork of a
published package — you get framework improvements by merging, the same
way you'd merge any other branch. See
[Updating from upstream](/deployment/updating-from-upstream) for the full
setup and the file-ownership contract that keeps merges conflict-free.
