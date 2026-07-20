# Splitting interlined routes

Everything in [Multi-source imports](/cities/multi-source) narrows *which*
routes get imported. A separate problem shows up after: sometimes a feed
models several lines riders know separately as one GTFS route — Metro
Bilbao's feed is the framework's own case, one `route_id` for its entire
network (L1 and L2 both), leaving every trip distinguishable only by
`trip_headsign`.

## Deriving the split from the data, not a diagram

Don't guess the split from a line diagram or Wikipedia — check the feed's
own `shape_id` naming first, when it has one. Bilbao's turned out to
encode origin→destination pairs directly:

```bash
awk -F',' '$1=="metro:MB" {print $4, $8}' trips.txt | sort -u
# Basauri metro:BID_BSR
# Basauri metro:KAB_BSR
# ...
```

This also surfaced something a diagram wouldn't have: some trips cross
between what riders call L1 and L2 (`Basauri→Plentzia`,
`Etxebarri→Kabiezes`) over a shared central trunk — not a clean two-line
network. The label that's actually well-defined per trip is the
*destination* (headsign), so that's what `lineOverrides` keys on: every
headsign reachable from Plentzia's side maps to "L1", every headsign from
Kabiezes' side maps to "L2", and a through-trip gets labeled by wherever
it's actually headed — which is what a rider standing on the platform sees
announced anyway.

## Config

`lineOverrides` (in `config/cities/<slug>.json`) splits a route into the
separately-numbered lines riders actually know, keyed by agency and then
by exact headsign. A headsign left out of the map keeps the route's own
name instead of being dropped, so the mapping never has to be exhaustive
to be safe:

```json
"lineOverrides": {
  "METRO": {
    "Plentzia":       { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Sopela":         { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Larrabasterra":  { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Ibarbengoa":     { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Etxebarri":      { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Basauri":        { "shortName": "L2", "longName": "Basauri - Kabiezes" },
    "Kabiezes":       { "shortName": "L2", "longName": "Basauri - Kabiezes" },
    "San Ignazio":    { "shortName": "L2", "longName": "Basauri - Kabiezes" }
  }
}
```

See `config/cities/example-city-b.example.jsonc` for the schema in its
full commented form.

## Why routing results need a separate fix

This config alone only fixes the static Lines browser. Real routing
results go through Minotor, whose own route model carries a `shortName` +
mode and nothing else — no headsign, no way to know which side of an
override a specific trip belongs to.

`buildSyntheticItinerary`'s `findRouteInfo` (in
`services/routing/minotorHelpers.js`) handles this by falling back to
nearest-stop matching against each candidate line's own stop list whenever
`shortName` alone doesn't land on exactly one `routes.json` entry — the
same signal already used to line up a leg with its map geometry. No config
needed for this part; it's automatic whenever `lineOverrides` (or a blank
`route_short_name` with no override at all) makes plain shortName matching
ambiguous.
