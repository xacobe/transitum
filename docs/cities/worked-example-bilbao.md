# Worked example: Bilbao

Bilbao is the framework's own committed multi-modal example — four
operators, four modes (bus, metro, tram, funicular), merged from four
separate official GTFS feeds with `pipeline/import_gtfs_multi.py`.

## The sources

```json
"transitSources": [
  {
    "type": "official-gtfs",
    "url": "https://ctb-gtfs.s3.eu-south-2.amazonaws.com/bilbobus.zip",
    "agencyIds": { "Bilbobus": "BILBOBUS" }
  },
  {
    "type": "official-gtfs",
    "url": "http://www.metrobilbao.eus/imports/google_transit.zip",
    "agencyIds": { "Metro Bilbao": "METRO" }
  },
  {
    "type": "official-gtfs",
    "url": "ftp://ftp.geo.euskadi.net/cartografia/Transporte/Moveuskadi/Euskotren/google_transit.zip",
    "agencyIds": {
      "ES:Euskotren:Operator:EUS_TrBi:": "TRANVIA",
      "ES:Euskotren:Operator:EUS_Funi:": "FUNICULAR"
    }
  },
  {
    "type": "official-gtfs",
    "url": "ftp://ftp.geo.euskadi.net/cartografia/Transporte/Moveuskadi/Bizkaibus/google_transit.zip",
    "agencyIds": { "200": "BIZKAIBUS" },
    "routeShortNames": ["A3247"]
  }
]
```

Each source is a single operator, so no `routeTypes`/`stopsWithinBbox`
narrowing was needed for three of them — Bilbobus, Metro Bilbao, and
Euskotren's tram+funicular are each already city-scale. The exception is
Bizkaibus: a provincial bus operator covering all of Biscay, of which only
one line (`A3247`, the airport bus) belongs in Bilbao's example —
`routeShortNames` keeps just that one out of roughly a hundred.

## Two data problems, not zero

Bilbao's feeds aren't perfectly clean either — two real issues came up and
are handled in config, not by patching the data by hand:

- **Metro Bilbao's feed has one `route_id` for its entire network** (both
  L1 and L2). `lineOverrides` splits it into the lines riders actually
  know, derived from the feed's own `shape_id` naming rather than guessed
  from a diagram — see [Splitting interlined routes](/cities/line-overrides).
- **Euskotren's own tram/funicular colors and Metro Bilbao's blank
  `route_short_name`** needed the pipeline's existing fallbacks (long-name
  fallback for an empty short name, hash-palette fallback for an agency
  that publishes the same color on every line) rather than anything
  Bilbao-specific.

## Result

Regenerate and check the mode mix after any change:

```bash
python3 -c "
import json
from collections import Counter
data = json.load(open('data/cities/bilbao/routes.json'))
print(Counter(r.get('mode', 'bus') for r in data))
"
# Counter({'bus': 47, 'metro': 2, 'funicular': 1, 'tram': 1})
```

::: tip
Figures above are a snapshot — cross-check against `config/cities/bilbao.json`
and `data/cities/bilbao/routes.json` directly for the current state, since
both evolve as the source feeds do.
:::

## Why this example ships `tiles.pmtiles`

`timetable.<hash>.bin`, `patterns.json`, `stops.bin`, and `tiles.pmtiles` are normally gitignored
and regenerated locally — reproducible from versioned source data, not
worth committing for a live city (see
[Generated data files](/pipeline/data-files)). An example is different:
it's already a point-in-time snapshot by design, same as the GTFS it ships
(schedules will drift as the real operators update their feeds — that's
expected, not a bug). Bilbao's `tiles.pmtiles` (8.4 MB, doesn't compress
further — PMTiles is already internally compressed) is committed on the
same logic: showing the whole app working, map included, right after
`make use-example` outweighs the cost of one more stale-by-design
snapshot.

## See also

- [Multi-source imports](/cities/multi-source) — the general reference for
  every filter used above, plus a second worked example (Zürich) that
  covers `routeTypes`/`stopsWithinBbox`/`collapseRouteIdsBy`, which
  Bilbao's sources don't happen to need.
- [Splitting interlined routes](/cities/line-overrides) — the full
  `lineOverrides` mechanism.
