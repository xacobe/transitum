# Example: Spain — Vigo (official-GTFS pattern)

A real, working example of the **official-gtfs** transit-data pattern (see
`config/cities.example.jsonc`): the operator (Vitrasa, Vigo's urban bus
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

- `cities.example.json` — the real city entry (plus its `spain` country
  entry). Merged into your own `config/cities.json` by `make use-example`.
- `gtfs/vigo/` — the official GTFS feed as imported by `import_gtfs.py`
  (what would normally live at `data/gtfs/spain/vigo/`).
- `cities/vigo/` — the app-ready JSON generated from that GTFS (what would
  normally live at `data/cities/vigo/`).

## Using it

Easiest: `make use-example COUNTRY=spain` from the repo root - merges
`cities.example.json` into `config/cities.json` and copies the data into
`data/`, ready for `make dev`.

To do it by hand instead: copy the city entry (and the `spain` country
entry, if not already present) from `cities.example.json` into
`config/cities.json`, then copy `gtfs/vigo/` to `data/gtfs/spain/vigo/` and
`cities/vigo/` to `data/cities/vigo/` - or re-run the pipeline fresh with
`make import-gtfs CITY=vigo URL=https://datos.vigo.org/data/transporte/gtfs_vigo.zip`
(the feed only carries a rolling ~7-day calendar window, so the committed
snapshot here will look increasingly stale over time - a fresh import gets
current schedules).
