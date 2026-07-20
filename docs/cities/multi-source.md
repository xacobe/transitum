# Multi-source imports

Some cities split transit across separate operators that each publish
their own feed — a bus company, a metro operator, a tram/rail operator —
with no single portal combining them. `pipeline/import_gtfs_multi.py`
merges several sources into one city.

Unlike `import_gtfs.py` (which takes `--url` on the command line), this
reads its list of sources from the city's own `config/cities/<slug>.json`:

```bash
python3 pipeline/import_gtfs_multi.py --city your-city
```

## Finding the source(s)

Check, in order:

1. The city or region's own open-data portal (search "`<city>` open data
   GTFS" or "`<city>` opendata portal").
2. A national access point — EU countries are required to publish one;
   look for "`<country>` national access point transport".
3. A feed catalog: [mobilitydatabase.org](https://mobilitydatabase.org) or
   [transit.land](https://transit.land).

**A single source rarely means a single feed.** A big multimodal operator
or regional authority often bundles everything into one GTFS — that's
*good* (one download, one config entry) but means you'll spend the next
step figuring out which parts of that one feed actually belong in your
city.

## Inspect before you commit

Don't write the config yet. Unzip the feed(s) and check three things —
this is where the real decisions get made.

**How many agencies, and how are routes split among them?**

```bash
unzip -p feed.zip agency.txt
unzip -p feed.zip routes.txt | awk -F',' '{print $NF}' | sort | uniq -c   # rough route_type histogram; adjust the column
```

Zürich's VBZ/ZVV feed is a good illustration of what turns up here: a
*single* agency (`Zürcher Verkehrsverbund`) — GTFS's implicit-agency case
(see `import_gtfs_multi.py`'s handling of it, originally added for Metro
Bilbao) — covering four route types: 21 trams, 3 S-Bahn rail lines, 3
funiculars, and **367 bus routes**.

**What geographic area does each mode actually cover?** A route count
alone doesn't tell you whether a mode is city-scale or regional. Check
stop coordinates, grouped by mode:

```python
import zipfile, csv, io
from collections import defaultdict

with zipfile.ZipFile("feed.zip") as zf:
    routes = list(csv.DictReader(io.TextIOWrapper(zf.open("routes.txt"), encoding="utf-8-sig")))
    trips  = list(csv.DictReader(io.TextIOWrapper(zf.open("trips.txt"), encoding="utf-8-sig")))
    stops  = {r["stop_id"]: r for r in csv.DictReader(io.TextIOWrapper(zf.open("stops.txt"), encoding="utf-8-sig"))}
    stop_times = csv.DictReader(io.TextIOWrapper(zf.open("stop_times.txt"), encoding="utf-8-sig"))

    route_type_by_id = {r["route_id"]: r["route_type"] for r in routes}
    trip_type = {t["trip_id"]: route_type_by_id.get(t["route_id"]) for t in trips}

    bounds = defaultdict(lambda: [90, -90, 180, -180])  # minLat, maxLat, minLon, maxLon
    for st in stop_times:
        rt = trip_type.get(st["trip_id"])
        s = stops.get(st["stop_id"])
        if not rt or not s or not s.get("stop_lat"):
            continue
        lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
        b = bounds[rt]
        b[0], b[1] = min(b[0], lat), max(b[1], lat)
        b[2], b[3] = min(b[2], lon), max(b[3], lon)

    for rt, b in bounds.items():
        print(rt, b)
```

For Zürich this was the deciding evidence: tram + rail + funicular
together spanned roughly 18×20 km (576 stops) — city scale, matching
Bilbao's committed example. The 367 bus routes spanned roughly 58×50 km
(5,827 stops) — the *entire canton*, not the city. There was no
agency-level way to separate "VBZ's own city buses" from the rest (every
route shares the one agency), so `routeTypes` alone could only keep
tram/rail/funicular and drop buses outright.

The buses ended up back in, though, once there was a way to keep just the
ones that reach the city: `stopsWithinBbox` (below) keeps a route if *any*
of its stops falls inside a given lat/lon box, using the same city-scale
box tram/rail/funicular were measured against. That kept 186 of the 367 —
routes that actually reach Zürich, from a bus network that mostly doesn't.

This is a judgment call, not a rule — Bilbao's own Bilbobus source is kept
in full because it genuinely *is* the city's own operator, not a regional
one. The difference is whether the extra routes represent the city or a
much larger area wearing the city's name; `stopsWithinBbox` exists for the
cases in between, where a single regional operator's routes are a mix of
both.

**Does the route/trip structure look sane?** Group by
`(agency_id, route_short_name)` and check that count is close to the raw
route count — a large mismatch means the feed is modeling something oddly
(see `collapseRouteIdsBy` below).

## Writing the config

```json
"transitSources": [
  {
    "type": "official-gtfs",
    "url": "https://example.org/bus-operator/gtfs.zip",
    "agencyIds": { "<original agency_id in the feed>": "<declared agencyId>" },
    "routeShortNames": ["A3247"],
    "routeTypes": ["0", "2", "7"],
    "stopsWithinBbox": { "minLat": 0, "maxLat": 0, "minLon": 0, "maxLon": 0 },
    "collapseRouteIdsBy": "shortName"
  },
  {
    "type": "official-gtfs",
    "url": "https://example.org/metro-operator/gtfs.zip",
    "agencyIds": { "Metro Co": "METRO" }
  }
]
```

`agencyIds` (`{"<agency_id in that feed>": "<declared agencyId>"}`) both
renames and filters: any agency in the feed *not* listed as a key is
dropped, along with everything that only belongs to it (routes, trips,
stops, shapes, calendar). Every ID that could collide between sources
(`route_id`, `trip_id`, `stop_id`, `shape_id`, ...) is prefixed per source
before merging, so two operators reusing the same raw IDs never clash.

Four more filters are available per source, all optional, all narrowing an
already agency-filtered set:

- **`routeShortNames`** — keep specific line(s) by name. Used for Bilbao's
  airport bus: one line (`A3247`) out of a ~100-route provincial operator
  (Bizkaibus).
- **`routeTypes`** — keep specific GTFS `route_type` code(s) (as strings —
  see `GTFS_MODES` in `pipeline/gtfs_routes_to_json.py` for the full list,
  e.g. `"0"` tram, `"2"` rail, `"7"` funicular). For a single agency whose
  feed is city-scale in some modes but regional in others.
- **`stopsWithinBbox`** — keep a route if any of its stops falls inside a
  lat/lon box. The harder version of the same problem `routeTypes` solves:
  one mode, one regional agency, no short-name pattern marking which
  routes reach the city. Independent of the city's own
  `tileBbox`/`searchBbox`, which need to cover every kept mode, not just
  this one source — set it explicitly here.
- **`collapseRouteIdsBy: "shortName"`** — merge routes that share
  `(agency_id, route_short_name)` onto one, *before* the pipeline's own
  direction/headsign grouping runs. Fixes a rarer feed defect: some
  conversions give every individual scheduled departure its own
  `route_id` instead of grouping same-line departures as trips under one
  shared route (seen on a geOps-converted Swiss ferry feed — 235
  "routes" that turned out to be **8 real boat lines** once collapsed;
  real GTFS never needs this). Only set it when a source is visibly
  producing near-duplicate lines (check `data/cities/<slug>/routes.json`'s
  route count after a first import).

**The same URL can appear in two sources on purpose** — one for the
city-scale modes (`routeTypes` alone separates them), one for a mode that
needs `stopsWithinBbox` too. `import_gtfs_multi.py` downloads and filters
each source independently, so this just means two passes over the same
feed with different filters — no special casing needed, though it does
mean downloading a large feed twice, worth knowing before doing it to
something over ~100 MB.

**Two sources drawing from the same feed can rediscover the same physical
stop independently** (a bus stop that's also a tram stop, say) and each
will emit its own copy with an identical prefixed ID once merged —
harmless in GTFS terms but something Minotor's parser doesn't tolerate (it
assumes `stop_id` is unique, per spec). `import_gtfs_multi.py` dedupes
exact-duplicate rows across all merged files for exactly this case; no
config needed, but if `make data-common` ever fails inside "Building stops
adjacency structure" after adding a second same-feed source, this is
almost certainly why.

Bounding boxes need to cover every mode you're keeping, not just the city
core — a lake ferry or a regional S-Bahn line can reach well past a tram
network's footprint. Widen `searchBbox`/`tileBbox` if a later step reports
stops or a route landing outside them.

## Run the import

```bash
python3 pipeline/import_gtfs_multi.py --city your-city
make data-common CITY=your-city
```

`import_gtfs_multi.py` downloads each source, applies the filters above,
prefixes every cross-referenced ID per source, and merges the result.
`data-common` regenerates `routes.json`/`stops.json`/`pois.json` and the
Minotor routing binaries from that merged GTFS. Watch the first command's
output — it prints the kept route/trip/stop count per source, which is a
second, cheaper sanity check than re-inspecting the raw feed:

```
Importing 3 source(s) for 'your-city'...
  downloading https://example.org/...
  [tag] kept 1 agency(ies), 27 routes, 60303 trips, 720 stops
  ...
Merged GTFS written to .../data/gtfs/<country>/your-city (221 routes, 3518 stops)
```

If a source's calendar has already lapsed by the time you run this
(checked against the real system clock — see
`pipeline/generate_transit_data.mjs`'s `today`), that mode will import
cleanly but produce zero routable trips. Nothing to fix in config — it
resolves itself once the source republishes a current window, or on the
next scheduled resync.

## Next

- [Splitting interlined routes](/cities/line-overrides) — a different
  problem: when a feed models several rider-facing lines as one route.
- [Verifying your city](/cities/verifying-your-city) — check the result.
