#!/usr/bin/env python3
"""Loads the city registry for the data-generation scripts.

Each city contributes only data (OSM area, synthetic schedule constants,
manual OSM relation curation, etc) - the logic of the scripts
(osm_to_gtfs.py, osm_to_pois.py, etc) is the same for all of them.

The real source of the data is config/cities.json — a single source of
truth shared with the frontend (frontend/src/cities.ts imports it directly,
Vite/TypeScript both support importing .json natively). This module just
loads that file and adds the path utilities the scripts need.
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

with open(ROOT / "config" / "cities.json", encoding="utf-8") as f:
    _REGISTRY = json.load(f)

# The framework ships with an empty cities.json (no city pre-configured) -
# .get() with defaults makes that the normal "fresh install, nothing added
# yet" state instead of a KeyError. get_city() below is where that state
# actually needs to fail, with an actionable message.
COUNTRIES = _REGISTRY.get("countries", {})
DEFAULT_CITY_SLUG = _REGISTRY.get("defaultCity")

# Slugs are the only uniqueness key used throughout (this dict, gtfs_dir(),
# city_data_dir(), the frontend's getCity()) - never validated against the
# whole registry at once, only checked one-at-a-time by add_city.py/
# use_example.py when adding a NEW city. A hand-edited cities.json (or two
# examples merged that happen to share a slug) could still sneak a dupe in,
# which would otherwise silently drop one entry here with no error.
_slugs = [c["slug"] for c in _REGISTRY.get("cities", [])]
_dupes = sorted({s for s in _slugs if _slugs.count(s) > 1})
if _dupes:
    raise SystemExit(
        f"config/cities.json has duplicate city slug(s): {', '.join(_dupes)}.\n"
        "Slugs must be unique across the whole registry, even across different countries "
        "- rename one of them."
    )

CITIES = {c["slug"]: c for c in _REGISTRY.get("cities", [])}


def get_city(slug: str) -> dict:
    try:
        return CITIES[slug]
    except KeyError:
        if not CITIES:
            raise SystemExit(
                "config/cities.json has no cities configured yet.\n"
                "Try a working example: make use-example COUNTRY=spain (or COUNTRY=burkina-faso)\n"
                'Or add your own: make add-city ARGS="--city ... --country ... --timezone ... --agency-name ..."'
            )
        valid = ", ".join(sorted(CITIES))
        raise SystemExit(f"Unknown city: '{slug}'. Valid values: {valid}")


def resolve_agency_id(city: dict, operator_tag: str | None) -> str:
    """Resolves an OSM relation's raw `operator` tag to one of the city's
    declared agency ids.

    Matches case-insensitively against both `operatorAliases` (curated
    text variants, same spirit as `osmPatches.refAliases`) and the agencies'
    own `agencyId`/`agencyName` - so a clean exact match never needs an
    alias entry. Falls back to `defaultAgencyId` (explicitly, not
    silently to the city's main agency) when the tag is missing or
    doesn't match anything known, so an unattributed route is visible
    for later curation instead of being quietly mislabeled.
    """
    if operator_tag:
        normalized = operator_tag.strip().lower()
        alias = city.get("operatorAliases", {}).get(normalized)
        if alias:
            return alias
        for agency in city["agencies"]:
            if normalized in (agency["agencyId"].lower(), agency["agencyName"].lower()):
                return agency["agencyId"]
    return city["defaultAgencyId"]


def parse_city_arg(doc: str | None = None) -> dict:
    """Parses --city from argv and returns the resolved city.

    Shared CLI boilerplate for the 5 generation scripts - each one only
    needs to pass its own module docstring (for --help) and gets back
    the resolved city dict, no need to also track args.city separately.
    """
    parser = argparse.ArgumentParser(description=doc)
    parser.add_argument("--city", required=True, help="City slug (see pipeline/cities.py)")
    args = parser.parse_args()
    return get_city(args.city)


# Versioned GTFS folders live in gtfs/<country>/<city>/ (not in the repo
# root) so that scaling to more countries/cities never fills the root
# with loose folders - see decision in the README.
def gtfs_dir(slug: str) -> Path:
    city = get_city(slug)
    return ROOT / "data" / "gtfs" / city["country"] / slug


def gtfs_zip_path(slug: str) -> Path:
    return ROOT / "data" / ".cache" / f"{slug}.gtfs.zip"


def city_data_dir(slug: str) -> Path:
    return ROOT / "data" / "cities" / slug


# Legacy alias — kept so any existing call sites compile without change.
def frontend_public_data_dir(slug: str) -> Path:
    return city_data_dir(slug)
