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
| `patterns.json` | ~0.3–1.5 KB | IndexedDB | Weekday → service-pattern map (see below) |
| `timetable.<hash>.bin` | ~90–380 KB **each** | IndexedDB | Minotor routing binary, one per distinct weekday service pattern |
| `stops.bin` | ~7–35 KB | IndexedDB | Minotor stop coordinates binary (shared by every pattern) |
| Noto Sans glyphs | ~2 MB | Cache API | Map label fonts from OpenFreeMap CDN |

The progress bar tracks only `tiles.pmtiles` (the dominant size). The other
files download in parallel after the tiles complete.

## Calendar patterns

A city's GTFS calendar can define several distinct weekday service patterns
— e.g. Bilbao's merged feed runs Mon-Thu, Friday, Saturday and Sunday as four
genuinely different schedules. `pipeline/generate_transit_data.mjs` generates
one Minotor timetable per weekday (the next occurrence of each from the
pipeline's run date) and **deduplicates by content hash** before writing
anything: identical days collapse into a single `timetable.<hash>.bin`, and
`patterns.json` maps each weekday to the hash that models it.

This means the offline cost scales with how much a city's calendar actually
varies, not with a fixed number of files:

- **OSM-synthetic cities** (frequency-based, no real published calendar —
  every `examples/burkina-faso` city) always collapse to exactly **one**
  pattern. Zero extra download compared to a single fixed timetable.
- **Real GTFS cities** typically produce 2-4 unique patterns. Measured on
  the `examples/spain` Bilbao feed: 4 patterns, adding **~0.9 MB** to the
  city pack (348 KB → 1.24 MB of routing binaries).

`patterns.json` also lists `exceptionDates` — dates with a
`calendar_dates.txt` override (holidays, planned diversions) not reflected
in the weekday patterns above. Advanced search flags these in the UI and
requires a live connection for them; the offline weekday patterns are not
guaranteed correct on those specific dates. This also fixes a pre-existing
bug: the single-timetable design used to bake in whichever day the pipeline
last happened to run on, with no reliable re-generation schedule — so a
production deployment could silently show a weekday's timetable on a Sunday
for weeks. Picking a pattern by weekday at *query* time removes that
staleness window entirely.

## Routing: online vs. offline

| State | Routing path | Server call? |
|---|---|---|
| City pack downloaded | WASM (Minotor) reads local `timetable.<hash>.bin` + `stops.bin` for the requested date's weekday | No — saves mobile data |
| No city pack, or the requested date is a known exception | POST `/routing/plan` to the Node.js server | Yes |

When local data is present, **the WASM is preferred even when online** —
same algorithm, same GTFS source, same result quality, but no round-trip.
The Node.js routing service handles users who haven't downloaded the city
pack, and any request for a date flagged in `exceptionDates`.

Data updates (`version.json` freshness check) are detected in the
background. If the server has regenerated transit data since the last
download, an "Update available" notice appears in Settings — tapping it
re-downloads only `patterns.json`, the referenced `timetable.<hash>.bin`
files, `stops.bin`, `routes.json`, and `routes-meta.json` (not the tiles,
which rarely change).
