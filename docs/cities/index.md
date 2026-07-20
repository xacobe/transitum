# Adding a city

The framework is designed so that adding a city only requires data work —
no code changes.

## 1. Generate the city block

`make add-city` queries Nominatim for the city's coordinates and bounding
box, writes a starter `config/cities/<slug>.json`, and adds the slug to
`VITE_CITIES` in `config/.env`:

```bash
make add-city ARGS="--city Dakar --country Senegal --timezone Africa/Dakar --agency-name DDD"
```

If `config/cities/<slug>.json` already exists the script exits with an
error — edit that file directly to update an existing city.

All available flags:

| Flag | Required | Default |
|---|---|---|
| `--city` | yes | — |
| `--country` | yes | — |
| `--timezone` | yes | — |
| `--agency-name` | yes | — |
| `--slug` | no | auto-derived from city name |
| `--agency-url` | no | `""` |
| `--agency-lang` | no | `fr` |
| `--service-start` | no | `06:00:00` |
| `--service-end` | no | `20:00:00` |

## 2. Review and adjust `config/cities/<slug>.json`

Open the new file. Fields to review:

- **`country`** — set to a key in `config/cities/_countries.json`'s
  `"countries"` object. Add a new entry there if needed (see
  [Generating map tiles](/cities/map-tiles) for the `geofabrikUrl` it
  needs).
- **`serviceStart` / `serviceEnd`** and **`frequencyPeriods`** — adjust to
  match actual local transit hours and headways. The generated values are
  generic defaults.
- **`agencies`** — update `agencyUrl` if known.

See [City config schema](/pipeline/config-schema) for the full field
reference.

## 3. Pick a data source and import it

- **[OSM-synthetic vs. official GTFS](/cities/data-sources)** — which one
  to use, and why to prefer a real feed whenever one exists. Covers the
  simple cases: reconstructing from OSM tags, or importing one official
  feed as-is.
- **[Multi-source imports](/cities/multi-source)** — merging several
  operators' feeds into one city, and narrowing a feed down to just the
  routes that belong (`routeShortNames`, `routeTypes`, `stopsWithinBbox`,
  `collapseRouteIdsBy`).
- **[Splitting interlined routes](/cities/line-overrides)** — a different,
  rarer problem: when a feed models several rider-facing lines as one GTFS
  route.

## 4. Generate map tiles

**[Generating map tiles](/cities/map-tiles)** — vector tiles from OSM,
including using a regional extract instead of a whole country to keep
generation fast.

## 5. Verify

**[Verifying your city](/cities/verifying-your-city)** — check the
generated data and query the routing API directly before touching the UI.

## 6. Build and deploy

```bash
make build
make deploy
```

The frontend and routing server pick up new cities automatically — no code
changes needed. See [Deployment](/deployment/) for the full server-side
rollout.

## Worked example

**[Worked example: Bilbao](/cities/worked-example-bilbao)** — the
framework's own committed multi-modal example, start to finish: four
operators, four modes, two data-quality problems solved through config.

## Installing vs. committing as an example

Installing a city and committing it as a permanent example are two
separate decisions. Committing means: the data ships in every `git clone`
of the framework, it's covered by the periodic resync workflows
(`data-sync-routes.yml`), and its config becomes a long-term reference
other deployments copy from. Worth doing for a city that showcases
something the existing examples don't — not worth doing just because a
city was easy to install. A city can be fully installed, tested, and
verified in a local checkout without ever being committed to `examples/`.
