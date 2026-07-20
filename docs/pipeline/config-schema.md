# City config schema

Every city is one `config/cities/<slug>.json` file. Two fully-commented
reference copies cover every field, one per source pattern — copy the
fields you need from whichever matches your city, by hand, into your own
`config/cities/<slug>.json` (the filename *is* the slug):

- `config/cities/example-city-a.example.jsonc` — OSM-synthetic
- `config/cities/example-city-b.example.jsonc` — official-GTFS

These files are documentation, not config — `pipeline/cities.py` and
`frontend/src/cities.ts` both glob-load only the real
`config/cities/*.json` files in your own checkout, never the `.example.jsonc`
ones.

## Core fields (both patterns)

| Field | Meaning |
|---|---|
| `slug` | Must match the filename |
| `country` | A key in `config/cities/_countries.json`'s `"countries"` object |
| `displayName`, `feedId` | Display name; internal ID prefix for stop/route IDs |
| `center` | `{ lat, lon }` — map default center |
| `searchBbox` | Destination search results are limited to this box |
| `tileBbox` | Bounds passed to Planetiler when generating map tiles |
| `tileMinzoom` | Lowest zoom level the vector tiles are generated for |
| `nearbyRadiusMeters` | Radius for "stops near me" |
| `offlineMb` | Shown in Settings' offline-download size estimate — update after `make tiles` |
| `defaultAgencyId` | Fallback when an OSM relation's `operator` tag doesn't resolve to a declared agency (OSM-synthetic only) |
| `agencies` | Array of `{ agencyId, agencyName, agencyUrl, agencyTimezone, agencyLang }` |
| `operatorAliases` | OSM-synthetic only — maps raw `operator=` tag text to a declared `agencyId` |
| `schedule` | `{ averageSpeedKmh, dwellSeconds, serviceStart, serviceEnd, frequencyPeriods }` — routing/display fallback, superseded by real GTFS trip times where available |
| `osmPatches` | `{ areaName, duplicateRelationIds, refAliases, excludeRelationIds }` — always required, since POIs always come from OSM regardless of transit source |

## Official-GTFS-only fields

| Field | Meaning |
|---|---|
| `useOfficialLineColors` | Use each line's own GTFS `route_color`/`route_text_color` instead of the hash-based palette |
| `transitSource` | Single-feed cities: `{ type: "official-gtfs", url }` |
| `transitSources` | Multi-source cities: an array — see [Multi-source imports](/cities/multi-source) for `agencyIds`, `routeShortNames`, `routeTypes`, `stopsWithinBbox`, `collapseRouteIdsBy` |
| `lineOverrides` | Splits one GTFS route into several rider-facing lines — see [Splitting interlined routes](/cities/line-overrides) |

Fields marked `(post-pipeline)` in the `.example.jsonc` comments should be
left at their defaults and filled in after the first data generation run.
