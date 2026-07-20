# Verifying your city

Two checks, both cheaper than clicking through the UI, and both exercise
the same code paths the app actually uses.

## Check the generated data directly

Catches config mistakes (a wrong `routeTypes` code, a typo'd `agencyIds`
key) before they reach the app:

```bash
python3 -c "
import json
from collections import Counter
data = json.load(open('data/cities/your-city/routes.json'))
print(Counter(r.get('mode', 'bus') for r in data))
"
# Counter({'bus': 186, 'tram': 21, 'ferry': 8, 'funicular': 3, 'rail': 3})
```

## Query the routing API directly

Spin up the routing service (or use `docker compose restart routing-serve`
if it's already running against this repo checkout) and query it directly:

```bash
curl -s -X POST http://localhost:3011/routing/plan -H 'Content-Type: application/json' -d '{
  "citySlug":"your-city","fromLat":0.0,"fromLon":0.0,
  "toLat":0.0,"toLon":0.0,"time":"10:00:00","numItineraries":2
}' | python3 -m json.tool
```

Pick two points that force a specific mode you just added — an origin and
destination near stops on that mode only, well outside walking distance,
so the itinerary can't fall back to a walk-only result. Check the
response's `route.shortName` and `agency.gtfsId` land on the mode and
agency you expect, not `null` or an unrelated line.

If you added a `routeShortNames`/`stopsWithinBbox` filter, also confirm
the mode you *meant* to exclude actually is — query with
`"transportModes":["<mode>"]` in the request body and check you get either
no itineraries, or itineraries using only the routes you intended to keep.
