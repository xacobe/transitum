# Contributing

Framework code lives under `pipeline/`, `frontend/src/` (outside
`custom/`/`customization/`), `services/`, and `.github/workflows/` — see
[Updating from upstream](/deployment/updating-from-upstream)'s ownership
table for the full split between framework-owned and deployment-owned
files. Changes to any of those are welcome as PRs against `main`.

`ci.yml` runs on every PR: typecheck + build for the frontend, and a lint
pass for the pipeline.

## Known issues

- **`useOfflineTiles.js`** — the only remaining `.js` file in `src/` (334
  lines, 5 consumers). TypeScript conversion is pending: it requires
  writing Minotor WASM type definitions by hand before the file itself can
  be typed. No functional regression while it stays as JS — `tsconfig.json`
  has `allowJs: true`.
