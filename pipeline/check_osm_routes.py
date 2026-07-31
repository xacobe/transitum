#!/usr/bin/env python3
"""Checks each active city for OSM route=bus changes since the last sync.

Writes to GITHUB_OUTPUT (or stdout if not set):
  cities_changed=<space-separated slugs>
  has_changes=true|false

Also updates data/cities/last-osm-sync.json so the next run knows
where to look from.
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cities import CITIES
from overpass import area_filter, overpass_query

ROOT = Path(__file__).parent.parent
LAST_SYNC_FILE = ROOT / "data" / "cities" / "last-osm-sync.json"
FALLBACK_SINCE = "2020-01-01T00:00:00Z"

# Runs nightly (see .github/workflows/data-sync-routes.yml) against the
# shared public Overpass instance - a short pause between each city's check
# keeps this from firing several queries back-to-back. How many
# OSM-synthetic cities a deployment actually has (and how conservative it
# wants to be with a shared public server) is entirely per-deployment, so
# this reads from the OSM_SYNC_SLEEP_SECONDS env var (the workflow passes
# it from an OSM_SYNC_SLEEP_SECONDS repo variable) rather than being a
# framework-wide constant - a deployment tunes it in GitHub's Settings ->
# Actions -> Variables, no need to fork this file.
SLEEP_BETWEEN_CITIES_SECONDS = int(os.environ.get("OSM_SYNC_SLEEP_SECONDS", "5"))


def load_last_sync() -> dict:
    if LAST_SYNC_FILE.exists():
        return json.loads(LAST_SYNC_FILE.read_text())
    return {}


def save_last_sync(data: dict) -> None:
    LAST_SYNC_FILE.write_text(json.dumps(data, indent=2) + "\n")


def count_changed_relations(area_name: str, since_iso: str, admin_level: str | None = None) -> int:
    # See overpass.py::area_filter - keeps this from counting changes in a
    # same-named-but-different area as this city's own. No bbox fallback
    # here (unlike osm_to_gtfs.py::fetch_route_relations) since this only
    # decides whether to queue a regeneration, not the source of truth for
    # what gets imported.
    query = f"""
    [out:json][timeout:30];
    area{area_filter(area_name, admin_level)}->.a;
    relation["route"="bus"](area.a)(newer:"{since_iso}");
    out count;
    """
    data = overpass_query(query)
    tags = data.get("elements", [{}])[0].get("tags", {})
    return int(tags.get("relations", 0))


def is_official_gtfs(city: dict) -> bool:
    """True whether the city gets its transit data from one real feed
    (transitSource, import_gtfs.py) or several merged into one
    (transitSources, import_gtfs_multi.py) - either way it's not
    OSM-synthetic, so this function's one caller treats them the same."""
    if city.get("transitSource", {}).get("type") == "official-gtfs":
        return True
    return any(s.get("type") == "official-gtfs" for s in city.get("transitSources", []))


def main() -> None:
    last_sync = load_last_sync()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    changed = []
    for city in CITIES.values():
        slug = city["slug"]

        # official-gtfs cities get their transit data from a real feed
        # (pipeline/import_gtfs.py or import_gtfs_multi.py), not OSM
        # reconstruction - queuing one here would have osm_to_gtfs.py
        # silently overwrite the official feed with a synthetic one on the
        # next sync run just because someone edited a bus relation in OSM.
        # POIs still come from OSM either way, but that's osm_to_pois.py's
        # job, not this check's.
        if is_official_gtfs(city):
            print(f"Skipping {slug} (official-gtfs city, not OSM-synthetic)")
            continue

        osm_cfg = city["osmPatches"]
        area = osm_cfg["areaName"]
        since = last_sync.get(slug, FALLBACK_SINCE)
        print(f"Checking {slug} (since {since})...")
        try:
            n = count_changed_relations(area, since, osm_cfg.get("adminLevel"))
            if n > 0:
                print(f"  {n} relation(s) changed → queue regeneration")
                changed.append(slug)
            else:
                print(f"  no changes")
        except Exception as e:
            print(f"  WARNING: check failed ({e}) — skipping to avoid false negatives", file=sys.stderr)
        last_sync[slug] = now
        time.sleep(SLEEP_BETWEEN_CITIES_SECONDS)

    save_last_sync(last_sync)

    output_lines = [
        f"cities_changed={' '.join(changed)}",
        f"has_changes={'true' if changed else 'false'}",
    ]
    output_file = os.environ.get("GITHUB_OUTPUT", "")
    if output_file:
        with open(output_file, "a") as f:
            f.write("\n".join(output_lines) + "\n")
    else:
        print("\n".join(output_lines))

    if changed:
        print(f"\nCities with route changes: {', '.join(changed)}")
    else:
        print("\nNo route changes detected.")


if __name__ == "__main__":
    main()
