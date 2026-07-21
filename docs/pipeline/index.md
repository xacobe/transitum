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

## Next

- [City config schema](/pipeline/config-schema) — every field, in the
  fully-commented reference files.
- [Generated data files](/pipeline/data-files) — what each script writes,
  and what's versioned vs. gitignored.
