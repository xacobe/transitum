# Example: Spain — Vigo (official-GTFS pattern)

A real, working example of the **official-gtfs** transit-data pattern (see
`config/cities/example-city-b.example.jsonc`): the operator (Vitrasa, Vigo's urban bus
network) publishes a real GTFS feed with actual timetables, imported as-is
via `pipeline/import_gtfs.py` instead of reconstructed from OSM tagging.
Single city, single country - a smaller, simpler example than
`examples/burkina-faso/`'s multi-city one, and a demonstration of real
scheduled service (59 lines, 1156 stops, real departure times) rather than
a frequency estimate.

Also doubles as a regression fixture for the official-gtfs code path (the
line-branching logic in `gtfs_routes_to_json.py` was built and verified
against this exact data - Vigo's line 7 splits into 5 real destinations
sharing a common trunk, a good stress test for that code).

## Contents

- `cities/vigo.json` — the real city entry, `cities/_countries.json` — the
  `spain` country entry it needs. Copied into your own `config/cities/` by
  `make use-example` (same one-file-per-city layout as `config/cities/`
  itself - see `config/cities/example-city-b.example.jsonc`).
- `gtfs/vigo/` — the official GTFS feed as imported by `import_gtfs.py`
  (what would normally live at `data/gtfs/spain/vigo/`).
- `cities/vigo/` — the app-ready JSON generated from that GTFS (what would
  normally live at `data/cities/vigo/`). Note this sits alongside, not
  inside, `cities/vigo.json` - a directory and a file can share a name stem.

## Using it

Easiest: `make use-example COUNTRY=spain` from the repo root - copies
`cities/vigo.json` (and the `spain` entry from `cities/_countries.json`)
into your own `config/cities/`, and copies the data into `data/`, ready
for `make dev`.

To do it by hand instead: copy `cities/vigo.json` into `config/cities/`
(and the `spain` entry from `cities/_countries.json` into your own
`config/cities/_countries.json`, if not already present), then copy
`gtfs/vigo/` to `data/gtfs/spain/vigo/` and `cities/vigo/` to
`data/cities/vigo/` - or re-run the pipeline fresh with
`make import-gtfs CITY=vigo URL=https://datos.vigo.org/data/transporte/gtfs_vigo.zip`
(the feed only carries a rolling ~7-day calendar window, so the committed
snapshot here will look increasingly stale over time - a fresh import gets
current schedules).
