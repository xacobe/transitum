#!/usr/bin/env python3
"""Shared Overpass API client for the OSM-based data-generation scripts.

Both osm_to_gtfs.py and osm_to_pois.py query the same public Overpass
instance with the same retry/backoff strategy - this module is the single
place that owns "how we talk to Overpass" instead of two copies that could
silently drift apart.
"""
import json
import time
import urllib.parse
import urllib.request

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
RETRIES = 6


def area_filter(area_name: str, admin_level: str | None = None) -> str:
    """Builds the Overpass QL tag filter for an area["name"=...] lookup.

    Always restricts to boundary=administrative - without it, area name
    matches are a union of every OSM element with that literal name,
    including a plain place=city/town node, which Nominatim (and by
    extension anything using its heuristics) gives a much wider search
    radius than the real place. admin_level further disambiguates when
    more than one administrative boundary shares the exact same name at
    different levels (e.g. a municipality and a supra-municipal comarca/
    district both named "Vigo" - the wider one silently pulled in POIs
    ~10km outside the real city, a real bug hit in production). OSM's
    admin_level numbering isn't standardized across countries, so this is
    per-city config (osmPatches.adminLevel), not a hardcoded constant.
    """
    clause = f'["name"="{area_name}"]["boundary"="administrative"]'
    if admin_level:
        clause += f'["admin_level"="{admin_level}"]'
    return clause


def overpass_query(query: str) -> dict:
    data = urllib.parse.urlencode({"data": query}).encode()
    last_err = None
    for attempt in range(1, RETRIES + 1):
        try:
            req = urllib.request.Request(
                OVERPASS_URL,
                data=data,
                headers={"User-Agent": "transitum-osm2gtfs/1.0"},
            )
            with urllib.request.urlopen(req, timeout=180) as resp:
                return json.load(resp)
        except Exception as e:
            last_err = e
            wait = 10 * attempt
            print(f"  (attempt {attempt}/{RETRIES} failed: {e}, retrying in {wait}s...)")
            time.sleep(wait)
    raise RuntimeError(f"Overpass query failed after {RETRIES} attempts: {last_err}")
