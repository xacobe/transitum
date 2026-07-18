# Example: Burkina Faso (OSM-synthetic pattern)

A real, working example of the **OSM-synthetic** transit-data pattern (see
`config/cities/example-city-a.example.jsonc`): no agency publishes a GTFS feed, so line
topology is reconstructed from OSM `route=bus` relation tagging
(`pipeline/osm_to_gtfs.py`) and schedules are a hand-configured frequency
estimate. This is what the framework ran in production with before the
Vigo test deployment replaced it - three SOTRACO-operated cities in one
country, a genuinely multi-city single deployment.

Also doubles as a regression fixture: any change to city-handling logic in
`pipeline/` or `frontend/src/` should still produce the same output against
this data. It has zero real-world dependency (no live GTFS feed to fetch,
no OSM API calls needed) since the outputs are already generated and
committed here.

## Contents

- `cities/ouagadougou.json`, `cities/koudougou.json`, `cities/bobo-dioulasso.json`
  — the real city entries, `cities/_countries.json` — the `burkina-faso`
  country entry they need. Copied into your own `config/cities/` by
  `make use-example` (same one-file-per-city layout as `config/cities/`
  itself - see `config/cities/example-city-a.example.jsonc`).
- `gtfs/<city>/` — the synthetic GTFS `osm_to_gtfs.py` produced for each
  city (what would normally live at `data/gtfs/burkina-faso/<city>/`).
- `cities/<city>/` — the app-ready JSON `gtfs_routes_to_json.py` /
  `gtfs_stops_to_json.py` / `osm_to_pois.py` produced from that GTFS (what
  would normally live at `data/cities/<city>/`; sits alongside, not inside,
  `cities/<city>.json` - a directory and a file can share a name stem).
  `dedougou` and `ouahigouya` only have this generated output, not a
  matching `cities/<city>.json` entry - leftover from an earlier, wider
  deployment; still useful as fixture data, just without a registry entry
  to copy.

## Using it

Easiest: `make use-example COUNTRY=burkina-faso` from the repo root - copies
all three cities' entries into your own `config/cities/` and copies their
data into `data/`, ready for `make dev`. Add `CITY=ouagadougou` (or any
single slug) to bring in just one.

To do it by hand instead: copy the relevant `cities/<city>.json` (and the
`burkina-faso` entry from `cities/_countries.json`, if not already present)
into your own `config/cities/`, then either copy `gtfs/<city>/` to
`data/gtfs/burkina-faso/<city>/` and `cities/<city>/` to
`data/cities/<city>/` directly, or just re-run the pipeline fresh with
`make data CITY=<city>` (needs network access to Overpass API; the
committed output here is a snapshot, not guaranteed byte-identical to a
fresh run months later as OSM data changes).
