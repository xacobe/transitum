#!/usr/bin/env python3
"""Adds a new city to config/cities.json.

Queries Nominatim (OpenStreetMap's geocoder) to fill in geographic data
automatically, then appends the new entry directly to config/cities.json
and adds the slug to VITE_CITIES in config/.env.

Exits with an error if the slug already exists — edit cities.json directly
to update an existing city.

Usage:
    make add-city ARGS="--city Dakar --country Senegal --timezone Africa/Dakar --agency-name DDD"
    python3 pipeline/add_city.py --city "Dakar" --country "Senegal" \
        --slug dakar --timezone Africa/Dakar \
        --agency-name "DDD" --agency-url https://example.com
"""
import argparse
import json
import sys
import urllib.request
import urllib.parse
from pathlib import Path


NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT    = "transitum-add-city/1.0"

ROOT         = Path(__file__).resolve().parent.parent
CITIES_JSON  = ROOT / "config" / "cities.json"
ENV_FILE     = ROOT / "config" / ".env"


def nominatim_search(city: str, country: str) -> dict:
    params = urllib.parse.urlencode({
        "city":    city,
        "country": country,
        "format":  "json",
        "limit":   1,
    })
    url = f"{NOMINATIM_URL}?{params}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=10) as resp:
        results = json.loads(resp.read())
    if not results:
        raise SystemExit(
            f"Nominatim returned no results for '{city}', '{country}'.\n"
            "Try a different spelling or check https://nominatim.openstreetmap.org"
        )
    return results[0]


def bbox_from_nominatim(bb: list[str]) -> dict:
    # Nominatim boundingbox: [south, north, west, east]
    south, north, west, east = (float(v) for v in bb)
    return {"minLat": round(south, 4), "maxLat": round(north, 4),
            "minLon": round(west, 4),  "maxLon": round(east, 4)}


def slugify(name: str) -> str:
    import re, unicodedata
    name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--city",         required=True, help="City name (for Nominatim query)")
    parser.add_argument("--country",      required=True, help="Country name (for Nominatim query)")
    parser.add_argument("--slug",         help="URL slug (default: auto-derived from city name)")
    parser.add_argument("--timezone",     required=True, help="IANA timezone, e.g. Africa/Dakar")
    parser.add_argument("--agency-name",  required=True, dest="agency_name")
    parser.add_argument("--agency-url",   default="", dest="agency_url")
    parser.add_argument("--agency-lang",  default="fr", dest="agency_lang")
    parser.add_argument("--service-start", default="06:00:00", dest="service_start")
    parser.add_argument("--service-end",   default="20:00:00", dest="service_end")
    parser.add_argument(
        "--geofabrik-url", default="", dest="geofabrik_url",
        help="Geofabrik download URL for the country PBF, e.g. "
             "https://download.geofabrik.de/africa/senegal-latest.osm.pbf",
    )
    args = parser.parse_args()

    slug = args.slug or slugify(args.city)

    with open(CITIES_JSON, encoding="utf-8") as f:
        registry = json.load(f)
    existing_slugs = {c["slug"] for c in registry.get("cities", [])}
    if slug in existing_slugs:
        raise SystemExit(
            f"City '{slug}' already exists in cities.json.\n"
            "Edit the file directly to update an existing city."
        )

    print(f"Querying Nominatim for '{args.city}', '{args.country}'...", file=sys.stderr)
    result = nominatim_search(args.city, args.country)

    lat   = round(float(result["lat"]), 4)
    lon   = round(float(result["lon"]), 4)
    bbox  = bbox_from_nominatim(result["boundingbox"])
    display_name = result.get("display_name", args.city).split(",")[0].strip()

    # Add a small margin around the Nominatim bbox for search
    margin = 0.1
    search = {k: round(v + (margin if "max" in k else -margin), 4) for k, v in bbox.items()}

    print(f"Found: {display_name} — center ({lat}, {lon})", file=sys.stderr)
    print(f"Bounding box: {bbox}", file=sys.stderr)
    print(file=sys.stderr)

    new_city = {
        "slug": slug,
        "country": "",  # Must match a key in "countries"
        "displayName": display_name,
        "feedId": slug,
        "center": {"lat": lat, "lon": lon},
        "searchBbox": search,
        "tileBbox": bbox,
        "tileMinzoom": 8,
        "nearbyRadiusMeters": 1500,
        "offlineMb": 0,  # Fill in after running: make tiles CITY=<slug>
        "defaultAgencyId": "UNKNOWN",
        "agencies": [
            {
                "agencyId": args.agency_name.upper(),
                "agencyName": args.agency_name,
                "agencyUrl": args.agency_url,
                "agencyTimezone": args.timezone,
                "agencyLang": args.agency_lang,
            }
        ],
        "operatorAliases": {},
        "schedule": {
            "averageSpeedKmh": 18.0,
            "dwellSeconds": 20,
            "serviceStart": args.service_start,
            "serviceEnd": args.service_end,
            "frequencyPeriods": [
                {"start": args.service_start, "end": "08:00:00", "headwaySeconds": 1800, "reliability": "medium"},
                {"start": "08:00:00", "end": "18:00:00", "headwaySeconds": 1200, "reliability": "high"},
                {"start": "18:00:00", "end": args.service_end, "headwaySeconds": 1800, "reliability": "medium"},
            ],
        },
        "osmPatches": {
            "areaName": args.city,
            "duplicateRelationIds": [],  # (post-pipeline) Fill after checking for duplicates
            "refAliases": {},
        },
    }

    registry.setdefault("cities", []).append(new_city)
    with open(CITIES_JSON, "w", encoding="utf-8") as f:
        json.dump(registry, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"✓ Added '{slug}' to config/cities.json", file=sys.stderr)

    if ENV_FILE.exists():
        env_lines = ENV_FILE.read_text(encoding="utf-8").splitlines(keepends=True)
        for i, line in enumerate(env_lines):
            if line.startswith("VITE_CITIES="):
                current = line.strip().split("=", 1)[1]
                if slug not in current.split(","):
                    env_lines[i] = f"VITE_CITIES={current},{slug}\n"
                    ENV_FILE.write_text("".join(env_lines), encoding="utf-8")
                    print(f"✓ Added '{slug}' to VITE_CITIES in config/.env", file=sys.stderr)
                else:
                    print(f"  '{slug}' already in VITE_CITIES — no change to config/.env", file=sys.stderr)
                break
        else:
            print(f"  VITE_CITIES not found in config/.env — add '{slug}' manually", file=sys.stderr)

    print("", file=sys.stderr)
    print("Next steps:", file=sys.stderr)
    print(f"  1. Review the new entry at the end of config/cities.json", file=sys.stderr)
    print(f"  2. Set \"country\" to the key in \"countries\" (add it if new)", file=sys.stderr)
    if args.geofabrik_url:
        print(f"     Also add to countries.<slug>: \"geofabrikUrl\": \"{args.geofabrik_url}\"", file=sys.stderr)
        print(f"     (make tiles will auto-download the PBF on first run)", file=sys.stderr)
    else:
        print(f"     If new country, add geofabrikUrl to countries.<slug> so make tiles", file=sys.stderr)
        print(f"     can auto-download the PBF — see https://download.geofabrik.de", file=sys.stderr)
    print(f"  3. Adjust serviceStart/serviceEnd and frequencyPeriods to match local transit", file=sys.stderr)
    print(f"  4. Run: make data CITY={slug}", file=sys.stderr)
    print(f"  5. Run: make tiles CITY={slug}  (then update offlineMb in cities.json)", file=sys.stderr)


if __name__ == "__main__":
    main()
