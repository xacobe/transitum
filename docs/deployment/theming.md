# Theming a deployment

The framework/deployment split only stays low-friction if a deployment's
own customizations never touch the same files the framework itself
commits to — see [Updating from upstream](/deployment/updating-from-upstream)
for the full ownership contract. Restyling has a dedicated, sanctioned
escape hatch for exactly this reason.

## Restyling

Copy `config/theme.css.example` to `config/theme.css` and override
whichever CSS custom properties you want (app colors, fonts, the MapLibre
basemap palette) — loaded last via a Vite virtual module, so the framework
never needs to touch it and a fresh clone with no `theme.css` just uses
the defaults. See `frontend/src/styles/tokens.css` for the full list of
overridable tokens.

## Per-line colors

Each line's badge color resolves in this order:

1. An explicit override in `config/line-colors.json` (see
   `config/line-colors.example.jsonc`)
2. The source GTFS's own official `route_color`, if the city opted in
   (the city config's `useOfficialLineColors`)
3. A deterministic hash-based fallback palette, so every line still gets a
   stable, distinct color with zero configuration

`make line-colors CITY=slug` seeds a starting entry per line (whatever
color it shows today) into `config/line-colors.json` — edit or delete
whichever you want; re-running it only ever fills in lines that don't have
an entry yet, never touches what you've already changed. Framework code
never writes to this file after the one-time seed, so it's yours to commit
to your own `origin` like `config/cities/`.
