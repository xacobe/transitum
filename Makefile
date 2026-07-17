SHELL := /bin/bash
COMPOSE := docker compose --env-file config/.env

# All cities declared in the registry - the committed source of truth
# (VITE_CITIES in config/.env is a separate, optional *frontend build-time*
# filter - narrows which of these actually ship in the picker/city-detect,
# but every registry entry still needs its data generated/synced).
CITIES := $(shell python3 -c "import json; print(' '.join(c['slug'] for c in json.load(open('config/cities.json')).get('cities', [])))" 2>/dev/null)

.PHONY: help dev build deploy data data-common pois tiles install add-city import-gtfs icons use-example line-colors

help:
	@echo ""
	@echo "  make install          Install frontend dependencies"
	@echo "  make dev              Start local dev server (http://localhost:5173)"
	@echo "  make build            Build frontend for production"
	@echo ""
	@echo "  make use-example COUNTRY=spain    Add a working example country (see examples/) - no OSM/GTFS fetch needed"
	@echo "  make add-city         Generate a starter cities.json entry for a new city"
	@echo "  make data CITY=slug   Regenerate all data from OSM for one city (GTFS + JSON + binaries)"
	@echo "  make import-gtfs CITY=slug URL=https://...   Same, but from an official GTFS feed"
	@echo "                         instead of reconstructing from OSM - prefer this whenever the"
	@echo "                         operator publishes one (see config/cities.example.jsonc)"
	@echo "  make pois             Regenerate POIs for all active cities (from config/.env)"
	@echo "  make tiles CITY=slug  Generate vector tiles (.pmtiles) for one city"
	@echo ""
	@echo "  make line-colors CITY=slug   Seed config/line-colors.json with a starting color"
	@echo "                         per line (official GTFS color if published, else the"
	@echo "                         framework's own fallback) - edit/delete entries freely,"
	@echo "                         re-running only ever fills in lines still missing one."
	@echo ""
	@echo "  make icons            (Re)generate the favicon/logo/PWA icons from VITE_THEME_COLOR"
	@echo ""
	@echo "  make up               Start all Docker services"
	@echo "  make down             Stop all Docker services"
	@echo "  make deploy           Build frontend + rsync to server + restart web"
	@echo ""
	@echo "  Active cities: $(CITIES)"
	@echo ""

add-city:
	@python3 pipeline/add_city.py $(ARGS)

# Adds a working example country (config + pre-generated data, see examples/)
# to config/cities.json and data/ - no OSM/live-GTFS fetch needed.
# Usage: make use-example COUNTRY=spain  (or COUNTRY=burkina-faso CITY=ouagadougou)
use-example:
ifndef COUNTRY
	$(error COUNTRY is required. Usage: make use-example COUNTRY=spain)
endif
	python3 pipeline/use_example.py --country $(COUNTRY) $(if $(CITY),--city $(CITY),)

# Seeds config/line-colors.json with a starting color per line of one city -
# see pipeline/seed_line_colors.py's docstring for exactly what "starting
# color" means and why re-running it is always safe.
# Usage: make line-colors CITY=vigo
line-colors:
ifndef CITY
	$(error CITY is required. Usage: make line-colors CITY=vigo)
endif
	python3 pipeline/seed_line_colors.py --city $(CITY)

# Regenerate JSON/binaries from whatever GTFS already sits in
# data/gtfs/<country>/<slug>/ - shared by both `data` (OSM path) and
# `import-gtfs` (official feed path), which only differ in how that GTFS
# got there in the first place.
data-common:
ifndef CITY
	$(error CITY is required. Usage: make data-common CITY=vigo)
endif
	python3 pipeline/gtfs_routes_to_json.py --city $(CITY)
	python3 pipeline/gtfs_stops_to_json.py --city $(CITY)
	python3 pipeline/osm_to_pois.py --city $(CITY)
	cd frontend && npm run generate-transit-data

# Import an official GTFS feed (see config/cities.example.toml's
# transitSource for how to record the URL for later re-syncs) instead of
# reconstructing one from OSM - use whenever the operator publishes one.
# Usage: make import-gtfs CITY=vigo URL=https://datos.vigo.org/data/transporte/gtfs_vigo.zip
import-gtfs:
ifndef CITY
	$(error CITY is required. Usage: make import-gtfs CITY=vigo URL=https://...)
endif
ifndef URL
	$(error URL is required. Usage: make import-gtfs CITY=vigo URL=https://...)
endif
	python3 pipeline/import_gtfs.py --city $(CITY) --url $(URL)
	$(MAKE) data-common CITY=$(CITY)

# npm workspaces (root package.json: frontend + pipeline) - pipeline/
# generate_transit_data.mjs imports 'minotor', which frontend/ also
# declares; workspaces hoist one shared copy to the root node_modules,
# which Node's resolver finds by walking up from pipeline/ same as it
# would frontend/. services/routing stays a separate, independently
# installed project on purpose - it's built inside its own Docker image
# (services/routing/Dockerfile), not on the host.
install:
	npm ci
	$(MAKE) icons

# Favicon/in-app logo/PWA icons: generated, not committed (they're
# deployment-owned brand assets, not framework code - see
# frontend/scripts/generate-icons.sh), so a clean install needs to produce
# them itself rather than assume they're already on disk. Requires
# config/.env to exist (reads VITE_THEME_COLOR) - run after that's set up.
icons:
	@if [ -f config/.env ]; then \
		frontend/scripts/generate-icons.sh; \
	else \
		echo "  skipping icon generation — config/.env not found yet (cp config/.env.example config/.env first)"; \
	fi

dev:
	cd frontend && npm run dev

build:
	cd frontend && npm run build

# Regenerate all pipeline outputs for a single city, reconstructing GTFS
# from OSM. Usage: make data CITY=ouagadougou
data:
ifndef CITY
	$(error CITY is required. Usage: make data CITY=ouagadougou)
endif
	python3 pipeline/osm_to_gtfs.py --city $(CITY)
	$(MAKE) data-common CITY=$(CITY)

# Regenerate only POIs for every city in config/cities.json.
pois:
	@for city in $(CITIES); do \
		echo "── POIs $$city ──"; \
		python3 pipeline/osm_to_pois.py --city $$city; \
	done

# Generate vector tiles for one city (requires Java 17+ and the OSM PBF).
# Usage: make tiles CITY=ouagadougou
tiles:
ifndef CITY
	$(error CITY is required. Usage: make tiles CITY=ouagadougou)
endif
	python3 pipeline/generate_pmtiles.py $(CITY)

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

deploy: build
	$(COMPOSE) config -q
	@echo "Deploying..."
