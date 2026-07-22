# Extending a deployment

Adding behavior — a new view, extra nav item, a different report/analytics
backend, … — has its own sanctioned escape hatch, separate from
[theming](/deployment/theming). Copy `frontend/src/custom/index.example.ts`
to `frontend/src/custom/index.ts` and fill in what you need:

```bash
cp frontend/src/custom/index.example.ts frontend/src/custom/index.ts
```

`custom/index.ts` is never read by the framework's own commits — it's your
file, commit it to your own `origin`. If it doesn't exist, the app behaves
exactly as if the file were empty; nothing is required to activate.

## The contract

It exports one `defineCustomization({ ... })` call (see
`frontend/src/customization/contract.ts` for the full typed contract):

| Field | Adds |
|---|---|
| `routes` | Extra Vue Router routes, appended after the framework's own. Use lazy components (`() => import(...)`) — this module is bundled into the entry chunk. |
| `navItems` | Extra bottom-nav items, appended after the framework's 4. One extra item fits comfortably; more gets cramped on narrow screens. |
| `install(app)` | Runs once, after Pinia/router/i18n are installed and before the framework's own stores initialize — register extra Pinia plugins/stores or `mergeLocaleMessage()` here. |
| `analytics` | An extra sink that receives every `track()` call alongside Umami. To fully replace Umami, also leave `VITE_ANALYTICS_URL`/`VITE_ANALYTICS_WEBSITE_ID` empty. |
| `submitReport` | Replaces the default PocketBase report backend. The framework still owns the submitting/submitted/error UI around the call — throw to signal failure. Note the PocketBase-backed admin panel (`/admin`) reads straight from PocketBase, so a deployment that swaps `submitReport` owns its own report inbox. |

The `version: 1` field is the upgrade story: if a future framework release
needs a breaking change to this contract, it bumps the accepted version,
and your `custom/index.ts` fails typecheck right after the next
`git merge upstream/main` — loud, at build time — instead of breaking
silently at runtime.

## Why not hooks or component shadowing

Deliberately **not** a Drupal/WordPress-style hook-and-event system, and
deliberately **not** component shadowing (a same-path file silently
overriding a framework component) — this explicit, small, versioned export
surface is a stable contract across `upstream` merges; shadowing risks
silently diverging from a framework component that's since changed, with
nothing to flag it. A route name that collides with a framework route is
skipped with a console warning (dev only) rather than silently replacing
the framework view.

Named UI slots inside specific framework views (e.g. a `<slot>` in the
stop detail panel) are a smaller-grained version of the same idea, addable
per view only when a real need shows up — each one is an API the framework
then has to keep stable forever, so it's not worth pre-emptively
sprinkling them around.
