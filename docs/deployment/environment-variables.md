# Environment variables

`config/.env` (copy from `config/.env.example`) is the single deployment
config entry point. `VITE_*` variables are inlined at build time and
visible in the browser bundle — never put secrets in them.

`config/.env.example` is fully commented and is the authoritative
reference for every variable — copy it, don't duplicate it here.
