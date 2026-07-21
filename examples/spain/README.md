# Example: Spain — Bilbao (official-GTFS pattern, multi-source)

A real, working example of the **official-gtfs** transit-data pattern (see
`config/cities/example-city-b.example.jsonc`), and specifically its
multi-source variant: four operators (Bilbobus, Metro Bilbao, Euskotren,
Bizkaibus) merged via `pipeline/import_gtfs_multi.py` into one city, four
modes (bus, metro, tram, funicular).

Two real data-quality problems are solved through config here rather than
hand-patched data:

- **Bizkaibus** is a provincial bus operator; only one of its ~100 lines
  (the airport bus) belongs in Bilbao's example — `routeShortNames` keeps
  just that one.
- **Metro Bilbao's feed models its entire network as a single GTFS route**,
  with L1 and L2 distinguishable only by `trip_headsign`. `lineOverrides`
  splits it into the lines riders actually know, derived from the feed's
  own `shape_id` naming rather than guessed from a diagram.

See the [documentation site](https://xacobe.github.io/transitum/cities/multi-source)
for the full walkthrough of both techniques (using Zürich as a second
worked example there, since it exercises a couple of filters Bilbao's
sources don't happen to need).

## Contents

- `cities/bilbao.json` — the real city entry, `cities/_countries.json` —
  the `spain` country entry it needs. Copied into your own
  `config/cities/` by `make use-example` (same one-file-per-city layout as
  `config/cities/` itself).
- `gtfs/bilbao.zip` — the merged GTFS from all four operators, zipped
  instead of loose `.txt`: the merge is ~60 MB as plain text (mostly
  `stop_times.txt`) and ~8 MB zipped. `make use-example` copies it straight
  to `data/.cache/bilbao.gtfs.zip` — the one place
  `generate_transit_data.mjs` reads a GTFS zip from — rather than
  extracting it to a `data/gtfs/spain/bilbao/` mirror first. Unzip it
  yourself if you want to inspect the raw feed locally.
- `cities/bilbao/` — the app-ready JSON generated from that GTFS, plus a
  pre-built `tiles.pmtiles`. What would normally live at
  `data/cities/bilbao/`. Note this sits alongside, not inside,
  `cities/bilbao.json` — a directory and a file can share a name stem.

### Why this example ships `tiles.pmtiles`

`timetable.<hash>.bin`, `patterns.json`, `stops.bin`, and `tiles.pmtiles` are normally gitignored
and regenerated locally — reproducible from versioned source data, not
worth committing for a live city. An example is different: it's already a
point-in-time snapshot by design, same as the GTFS it ships (schedules will
drift as the real operators update their feeds — that's expected, not a
bug). `tiles.pmtiles` (8.4 MB, doesn't compress further — PMTiles is
already internally compressed) is committed on the same logic: showing the
whole app working, map included, right after `make use-example` outweighs
the cost of one more stale-by-design snapshot.

## Using it

Easiest: `make use-example COUNTRY=spain` from the repo root — copies
`cities/bilbao.json` (and the `spain` entry from `cities/_countries.json`)
into your own `config/cities/`, copies the data into `data/`, and
regenerates the routing binaries — ready for `make dev`.

To do it by hand instead: copy `cities/bilbao.json` into `config/cities/`
(and the `spain` entry from `cities/_countries.json` into your own
`config/cities/_countries.json`, if not already present), then copy
`gtfs/bilbao.zip` to `data/.cache/bilbao.gtfs.zip` and `cities/bilbao/` to
`data/cities/bilbao/`, then run `node pipeline/generate_transit_data.mjs`
to build the routing binaries — or re-run
`python3 pipeline/import_gtfs_multi.py --city bilbao` instead of using the
committed snapshot (the four source URLs are in `cities/bilbao.json`'s
`transitSources`) for current data.
