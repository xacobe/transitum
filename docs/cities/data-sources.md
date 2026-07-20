# OSM-synthetic vs. official GTFS

Transit data (stops/routes/timetable — not POIs, which always come from
OSM) can come from either source. See `config/cities/example-city-a.example.jsonc`
(OSM-synthetic) and `config/cities/example-city-b.example.jsonc`
(official-GTFS) for fully commented examples of both.

- **Official GTFS** (preferred when it exists) — the operator or the
  city/region's open-data portal publishes a real feed with actual
  schedules. Far more complete than anything reconstructed from OSM tags:
  real timetables instead of an estimated frequency, and full line
  coverage instead of whatever happens to be tagged in OSM. Look for one
  at the city/region's open-data portal, a national access point (EU
  operators are required to publish to one), or a feed catalog like
  [mobilitydatabase.org](https://mobilitydatabase.org) or
  [transit.land](https://transit.land). If you find one, skip to
  [Importing a single official feed](#importing-a-single-official-feed)
  below.
- **OSM-synthetic** (fallback) — no agency publishes a feed, so the
  topology is reconstructed from OSM route relation tagging (`route=bus`
  relations) and schedules are a hand-configured frequency estimate.
  Coverage is only as good as OSM's tagging for that city/network — can be
  significantly incomplete for cities with light OSM transit mapping.

## Reconstructing from OSM

```bash
make data CITY=your-city
```

This generates all data files in `data/cities/your-city/` — stops, routes,
POIs, and routing binaries. The first run queries the Overpass API; expect
a few minutes for a large city. Under the hood, this runs, in order:

1. `pipeline/osm_to_gtfs.py` — OSM relations → synthetic GTFS in `data/gtfs/`
2. `pipeline/gtfs_routes_to_json.py` — GTFS + OSM → `data/cities/<city>/routes.json`
3. `pipeline/gtfs_stops_to_json.py` — GTFS stops → `data/cities/<city>/stops.json`
4. `pipeline/osm_to_pois.py` — OSM Overpass → `data/cities/<city>/pois.json`
5. `npm run generate-transit-data` — GTFS → `timetable.bin` + `stops.bin`

Steps 2–5 are shared with the official-GTFS path below (exposed on their
own as `make data-common CITY=<city>`) — everything downstream of the raw
GTFS is source-agnostic.

After the pipeline runs, check its output for warnings about duplicate
relation IDs or unrecognized `ref=` tags. If any appear, fill in
`duplicateRelationIds` and `refAliases` under `osmPatches` in the city's
`config/cities/<slug>.json`, then re-run. If the area also happens to catch
relations that are geographically in-scope but not actually part of this
city's network — a same-named place elsewhere in the world (Overpass area
name matching isn't unique — e.g. "Vigo" matched both the Galician city and
a village in Kent, England), or a legitimate but out-of-scope
intercity/regional coach line that just happens to pass through — list
their relation IDs under `excludeRelationIds` in the same object and
re-run.

## Importing a single official feed

```bash
make import-gtfs CITY=your-city URL=https://example.org/opendata/gtfs.zip
```

Downloads the feed, remaps its `agency_id`(s) to the ones declared under
`agencies` (matched by order — the common case is one agency on each side;
the script exits with an error asking you to map them by hand if the
counts don't match), and runs the same routes/stops/POIs/binaries steps as
above. Add a `transitSource` object to the city's
`config/cities/<slug>.json` recording `"type": "official-gtfs"` and the
feed `url`, so it's clear later where the data came from and where to
re-fetch it — see `config/cities/example-city-b.example.jsonc`.

Some feeds only cover a short rolling calendar window (check
`calendar_dates.txt`'s date range after importing) — if so, plan to re-run
`make import-gtfs` periodically to keep it current; there's no automated
resync workflow for this path yet (unlike `data-sync-routes.yml` for the
OSM path).

If the city's transit is split across *several* operators with no single
feed covering all of them, see [Multi-source imports](/cities/multi-source)
instead.
