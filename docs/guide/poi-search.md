# POI search

Destination search is fully local — bus stops + POIs are indexed in a
single MiniSearch pass on the device. No external geocoder. Works offline.

POIs come from `pois.json` (~120 KB gzipped in the Bilbao example, ~5,600
places) generated from OpenStreetMap. Each POI has a `tier` field used for
relevance ranking:

| Tier | Contents | OSM keys |
|---|---|---|
| 1 | Hospitals, clinics, markets, universities, neighbourhoods, transit stations | `amenity`, `place`, `healthcare=hospital` |
| 2 | Banks, pharmacies, schools, hotels, fuel, police, libraries, parks, museums, historic sites, government buildings | `amenity`, `tourism`, `leisure`, `historic`, `healthcare`, `government` |
| 3 | Shops, restaurants, offices, worship, leisure, remaining amenities | `shop`, `office`, `amenity`, `tourism`, `leisure`, `healthcare` |

The `data-sync-pois.yml` workflow regenerates and deploys `pois.json` for
all active cities on the 1st of each month.
