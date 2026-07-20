# Generated data files

Each city produces, under `data/cities/<slug>/`:

| File | Contents | Versioned? |
|---|---|---|
| `stops.json` | Stop list | Yes |
| `routes.json` | Line geometries + stop sequences | Yes |
| `routes-meta.json` | Line metadata, no geometry (stop panels) | Yes |
| `pois.json` | Named places with a tier field | Yes |
| `version.json` | Data version stamp (cache invalidation) | Yes |
| `timetable.bin` | Minotor routing binary | No — regenerate locally |
| `stops.bin` | Minotor stops binary | No — regenerate locally |
| `tiles.pmtiles` | Vector map tiles | No — regenerate locally |

The three gitignored binary files are all reproducible from the versioned
GTFS source (`data/gtfs/<country>/<city>/` for OSM-synthetic cities,
`data/.cache/<slug>.gtfs.zip` for official-GTFS ones) via
`make data-common CITY=<slug>` and `make tiles CITY=<slug>`.

A committed example under `examples/` can deviate from this — see
[Worked example: Bilbao](/cities/worked-example-bilbao#why-this-example-ships-tiles-pmtiles)
for when and why.

See [Repository layout](/guide/repository-layout) for the full directory
tree this fits into.
