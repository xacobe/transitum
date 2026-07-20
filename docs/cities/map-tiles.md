# Generating map tiles

Requires Java 17+ (the first run downloads Planetiler, ~150 MB, one-time)
— or Docker via `--docker`, no Java install needed.

```bash
make tiles CITY=your-city
```

Output: `data/cities/your-city/tiles.pmtiles` (~20–80 MB depending on city
size). Once generated, update `offlineMb` in `config/cities/your-city.json`
to match the file size in megabytes.

## Using a regional extract

By default this downloads and reads the *whole country's* OSM extract —
Planetiler still has to parse the entire input file even though `--bounds`
only trims the output, so this is fine for a small country and needlessly
slow for a large one. If the country's data provider also publishes
smaller regional/state extracts, point at one directly instead:

```bash
python3 pipeline/generate_pmtiles.py your-city --docker \
  --osm-path data/.cache/your-region.osm.pbf
```

Whether a split like this exists depends entirely on the country's data
provider (Geofabrik, most commonly). Two real data points from cities
installed while building this framework:

- **Spain** splits by autonomous community. Bilbao used
  `pais-vasco-latest.osm.pbf` (68 MB) rather than all of Spain (1.4 GB),
  cutting tile generation from several minutes to about 90 seconds.
- **Switzerland** doesn't split further — its single country file (539 MB)
  is what a `--osm-path` for a Swiss city would point at anyway, still
  worth doing explicitly rather than assuming a split exists you'd need to
  hunt for.

## Run tile generations one at a time

Two Planetiler runs sharing `data/tmp` as their working directory will
corrupt each other's output — running two `generate_pmtiles.py` invocations
concurrently (even for different cities) is not safe. Run them
sequentially.

## Next

[Verifying your city](/cities/verifying-your-city) — check the generated
data and a real routing query before touching the UI.
