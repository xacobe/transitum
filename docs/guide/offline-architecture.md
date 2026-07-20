# Offline architecture

The app has two layers of caching with distinct download moments.

## Layer 1 — App shell (automatic, on first visit)

The Service Worker caches the full app bundle on first load: all JS/CSS/HTML
chunks, the Minotor WASM binary (the routing algorithm), and static assets.
No user action needed. After this, the app UI works without a network
connection.

## Layer 2 — City pack (explicit, user-triggered from Settings)

When the user taps "Download city", the following files are fetched and
stored locally, in this order:

| File | Size | Storage | Purpose |
|---|---|---|---|
| `tiles.pmtiles` | 4–80 MB | IndexedDB (Blob) | Vector map tiles — the map works offline |
| `routes.json` | ~1 MB | Cache API | Line geometries for the map and offline routing |
| `routes-meta.json` | ~300 KB | Cache API | Line metadata for stop detail panels |
| `stops.json` | ~200 KB | Cache API | Stop list, warmed for offline search |
| `pois.json` | ~90 KB | Cache API | Points of interest, warmed for offline search |
| `timetable.bin` | ~200 KB | IndexedDB | Minotor routing binary (trip/stop graph) |
| `stops.bin` | ~60 KB | IndexedDB | Minotor stop coordinates binary |
| Noto Sans glyphs | ~2 MB | Cache API | Map label fonts from OpenFreeMap CDN |

The progress bar tracks only `tiles.pmtiles` (the dominant size). The other
files download in parallel after the tiles complete.

## Routing: online vs. offline

| State | Routing path | Server call? |
|---|---|---|
| City pack downloaded | WASM (Minotor) reads local `timetable.bin` + `stops.bin` | No — saves mobile data |
| No city pack | POST `/routing/plan` to the Node.js server | Yes |

When local data is present, **the WASM is preferred even when online** —
same algorithm, same GTFS source, same result quality, but no round-trip.
The Node.js routing service only handles users who haven't downloaded the
city pack.

Data updates (`version.json` freshness check) are detected in the
background. If the server has regenerated transit data since the last
download, an "Update available" notice appears in Settings — tapping it
re-downloads only `timetable.bin`, `stops.bin`, `routes.json`, and
`routes-meta.json` (not the tiles, which rarely change).
