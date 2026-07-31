# Pipeline reference

All pipeline scripts take `--city <slug>`. Available slugs are the
filenames under `config/cities/` (minus `.json`).

## Scripts

| Script | Produces |
|---|---|
| `use_example.py` | Copies an `examples/<name>/` fixture into `config/cities/` + `data/` |
| `add_city.py` | Queries Nominatim, writes a starter `config/cities/<slug>.json` |
| `osm_to_gtfs.py` | OSM relations → synthetic GTFS |
| `import_gtfs.py` | Imports a single official GTFS feed |
| `import_gtfs_multi.py` | Merges several official GTFS feeds (see [Multi-source imports](/cities/multi-source)) |
| `gtfs_routes_to_json.py` | GTFS + OSM shapes → `routes.json` / `routes-meta.json` — line geometries, stops, frequency |
| `gtfs_stops_to_json.py` | GTFS stops → `stops.json` |
| `osm_to_pois.py` | OSM Overpass → `pois.json` |
| `generate_transit_data.mjs` | GTFS zip → Minotor routing binaries, one `timetable.<hash>.bin` per distinct weekday service pattern (`patterns.json`), plus `stops.bin` |
| `generate_pmtiles.py` | OSM PBF → `tiles.pmtiles` (Planetiler; see [Generating map tiles](/cities/map-tiles)) |
| `check_osm_routes.py` | CI: detects OSM route changes since last sync |
| `cities.py` | Shared path utilities + city registry loader |

Everything from `gtfs_routes_to_json.py` onward is source-agnostic — it
works identically whether the GTFS came from `osm_to_gtfs.py`,
`import_gtfs.py`, or `import_gtfs_multi.py`.

## Regenerating a city's data

Two variants depending on where the city's transit data comes from (see
[Adding a city](/cities/)):

```bash
make data CITY=your-city                                              # OSM-synthetic
make import-gtfs CITY=your-city URL=https://example.org/gtfs.zip      # official GTFS feed
```

`make data` runs `osm_to_gtfs.py` then the shared routes/stops/POIs/binaries
steps. `make import-gtfs` replaces the first step with `import_gtfs.py`
(downloads and remaps agency IDs on the official feed instead) and runs
the same shared steps — exposed on their own as:

```bash
make data-common CITY=your-city
```

Regenerate POIs for all active cities (from `VITE_CITIES` in `config/.env`):

```bash
make pois
```

Generate vector map tiles (requires Java 17+ and the OSM PBF at
`data/.cache/`, or `--docker`):

```bash
make tiles CITY=your-city
```

## Automatic re-sync (CI)

Two scheduled GitHub Actions workflows keep deployed data current without
manual re-runs — `.github/workflows/data-sync-routes.yml` (daily, `0 2 * * *`)
and `data-sync-pois.yml` (monthly, 1st of the month). Both are opt-in, not
opt-out: their schedule trigger is a no-op until a deployment sets
`OSM_ROUTES_SYNC_ENABLED` / `OSM_POIS_SYNC_ENABLED` to `true` (also a repo
variable) — same reasoning as the analytics/custom-backend extension
points, a fresh clone shouldn't start SSHing into a server nobody's
configured yet. See [Deployment](/deployment/#automatic-data-sync-optional)
for the full setup checklist (secrets, variables). Manual runs
(`workflow_dispatch`) always work regardless of the flag, useful for
trying either workflow once before committing to the schedule.

Which cities get
checked is already per-deployment (read from `config/cities/`), and the
pause between each OSM-synthetic city's check is too — set an
`OSM_SYNC_SLEEP_SECONDS` repo variable (Settings → Actions → Variables,
same mechanism as `DEPLOY_PATH`, see [Deployment](/deployment/)) to tune it
for how many such cities a deployment actually has, no need to edit the
workflow file. The cron schedule itself is the one thing that can't follow
that pattern — GitHub Actions only accepts a literal cron expression, not a
variable — so changing daily to, say, every 3 days means either editing
`data-sync-routes.yml` directly (accepted as a deliberate upstream
divergence, same as any other framework-owned file), or disabling the
schedule from the Actions tab and relying on the workflow's
`workflow_dispatch` trigger (already wired up, with a `force_cities` input)
for manual runs instead.

The daily routes sync is cheaper than it sounds: `check_osm_routes.py`
skips every official-GTFS city outright (they don't come from OSM, so
there's nothing to check), and for the remaining OSM-synthetic ones it only
runs a small incremental `out count;` Overpass query (relations changed
since the last run) with a short pause between cities — not a full data
pull. Only a city with actual detected changes goes through the heavier
full regeneration (`osm_to_gtfs.py` onward) that same run. The monthly POI
sync does touch every city (POIs always come from OSM, regardless of
transit source) and runs the real `osm_to_pois.py` query each time, which
is why it's monthly rather than nightly.

## Next

- [City config schema](/pipeline/config-schema) — every field, in the
  fully-commented reference files.
- [Generated data files](/pipeline/data-files) — what each script writes,
  and what's versioned vs. gitignored.
