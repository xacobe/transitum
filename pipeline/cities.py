#!/usr/bin/env python3
"""Loads the city registry for the data-generation scripts.

Each city contributes only data (OSM area, synthetic schedule constants,
manual OSM relation curation, etc) - the logic of the scripts
(osm_to_gtfs.py, osm_to_pois.py, etc) is the same for all of them.

The real source of the data is config/cities/ — a single source of truth
shared with the frontend (frontend/src/cities.ts glob-imports the same
directory). One city per config/cities/<slug>.json file, plus a single
config/cities/_countries.json for the shared country registry and the
default-city slug (not a per-city concern, so it doesn't belong in any
one city's file). This module just loads that directory and adds the
path utilities the scripts need.
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITIES_DIR = ROOT / "config" / "cities"
_COUNTRIES_FILE = CITIES_DIR / "_countries.json"

# The framework ships with an empty config/cities/ (no city pre-configured,
# not even _countries.json) - .get() with defaults makes that the normal
# "fresh install, nothing added yet" state instead of a KeyError/
# FileNotFoundError. get_city() below is where that state actually needs
# to fail, with an actionable message.
_countries_meta = (
    json.loads(_COUNTRIES_FILE.read_text(encoding="utf-8")) if _COUNTRIES_FILE.exists() else {}
)
COUNTRIES = _countries_meta.get("countries", {})
DEFAULT_CITY_SLUG = _countries_meta.get("defaultCity")

# One file per city means a filename collision (the actual uniqueness
# mechanism) is already impossible - the only way to still get a dupe is a
# city's own "slug" field disagreeing with its filename (copy-pasted file,
# forgot to update the field) or, less likely, two files whose "slug"
# fields collide despite different filenames. Both are checked below.
CITIES: dict[str, dict] = {}
for _path in sorted(CITIES_DIR.glob("*.json")):
    if _path.name == "_countries.json":
        continue
    _city = json.loads(_path.read_text(encoding="utf-8"))
    if _city["slug"] != _path.stem:
        raise SystemExit(
            f'config/cities/{_path.name} has "slug": "{_city["slug"]}", '
            f'which must match its filename ("{_path.stem}") - rename the file or fix the field.'
        )
    if _city["slug"] in CITIES:
        raise SystemExit(f'Duplicate city slug "{_city["slug"]}" in config/cities/.')
    CITIES[_city["slug"]] = _city


def get_city(slug: str) -> dict:
    try:
        return CITIES[slug]
    except KeyError:
        if not CITIES:
            raise SystemExit(
                "config/cities/ has no cities configured yet.\n"
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
