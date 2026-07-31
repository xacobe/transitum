# Deployment

Node/npm are not on the server — build always runs locally, then synced
over. The example commands below use `~/app` as the remote project
directory — pick whatever you like, it just needs to match wherever you
clone this repo on the server. The CI workflows
(`.github/workflows/data-sync-*.yml`) read the same path from a
`DEPLOY_PATH` repository variable (Settings → Actions → Variables),
defaulting to `~/app` too if unset — set it once there instead of editing
the workflow files.

## Frontend changes

```bash
make build
rsync -az --delete frontend/dist/  root@<server>:~/app/frontend/dist/
rsync -az            data/cities/   root@<server>:~/app/data/cities/
ssh root@<server> 'cd ~/app && docker compose restart web'
```

## Routing service changes

```bash
rsync -az services/routing/ root@<server>:~/app/services/routing/
ssh root@<server> 'cd ~/app && docker compose build routing-serve && docker compose up -d routing-serve'
```

## nginx config changes

`deploy/nginx/default.conf.template` is rendered by nginx's own entrypoint
on container start (`${DOMAIN}` from `config/.env` — see the template's
header comment), so a config change just needs a restart, not a rebuild:

```bash
rsync deploy/nginx/default.conf.template root@<server>:~/app/deploy/nginx/default.conf.template
ssh root@<server> 'cd ~/app && docker compose restart web'
```

## PocketBase admin UI

The PocketBase admin interface (`/_/`) is never exposed publicly — nginx
only proxies `/pb/api/`. Access it via SSH tunnel:

```bash
ssh -L 8090:localhost:8090 root@<server>
# then open http://localhost:8090/_/ in your browser
```

## Automatic data sync (optional)

`data-sync-routes.yml` and `data-sync-pois.yml` (see [Pipeline
reference](/pipeline/#automatic-re-sync-ci) for what they actually do)
assume this same self-hosted SSH + docker-compose deploy story, and are
off by default — the nightly/monthly schedule only fires once a deployment
opts in. To start using them:

1. Add repo secrets (Settings → Secrets and variables → Actions →
   Secrets): `SSH_PRIVATE_KEY`, `SERVER_HOST`, `SERVER_USER` — what the
   deploy step SSHes into.
2. Set `DEPLOY_PATH` as a repo variable if it's not `~/app`.
3. Set `OSM_ROUTES_SYNC_ENABLED` and/or `OSM_POIS_SYNC_ENABLED` to `true`
   (repo variables) once ready for the schedule to actually run — or leave
   them unset and trigger a one-off sync manually from the Actions tab
   (`workflow_dispatch` always works, on or off).

A different deploy story (not self-hosted SSH + docker-compose) means
writing your own sync workflow rather than reusing these — same as any
other framework-owned CI file, see [Updating from
upstream](/deployment/updating-from-upstream).

## Next

- **[Environment variables](/deployment/environment-variables)** —
  `config/.env`, what's required vs. optional.
- **[Theming a deployment](/deployment/theming)** — restyling and
  per-line colors without touching framework-owned files.
- **[Extending a deployment](/deployment/extending)** — adding routes,
  nav items, or swapping the analytics/reports backend.
- **[Analytics](/deployment/analytics)** — the Umami dashboard and opting
  your own browser out.
- **[Updating from upstream](/deployment/updating-from-upstream)** —
  staying in sync, and what's yours vs. the framework's.
