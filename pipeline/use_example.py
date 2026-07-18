#!/usr/bin/env python3
"""Adds a working example country (one or more cities) to config/cities/ and data/.

The framework ships with config/cities/ empty - this is the "easy way to try
one" it points to. Copies the city files (and the country entries they need)
from examples/<country>/cities/ into config/cities/, copies that example's
pre-generated gtfs/ and cities/ data into data/, and generates the Minotor
routing binaries (timetable.bin + stops.bin) from that GTFS - so the app,
including offline/online route planning, runs immediately after `make dev`.
No network calls needed (no OSM, no live GTFS feed).

Map tiles are the one thing NOT generated here - `make tiles CITY=<slug>`
needs Java or Docker plus a country-level OSM PBF (100MB-1GB+ depending on
country, downloaded once and cached), too heavy for a "try it in 30 seconds"
path. Without it the map falls back to no basemap; run `make tiles` after if
you want the visual map, not just stops/routes/search.

Refuses to add a city whose config/cities/<slug>.json already exists -
re-running this (or `make add-city`) for the same example is a no-op error,
not a merge.

Usage:
    make use-example COUNTRY=spain
    make use-example COUNTRY=burkina-faso
    make use-example COUNTRY=burkina-faso CITY=ouagadougou   # just one city
    python3 pipeline/use_example.py --country spain
"""
import argparse
import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CITIES_DIR = ROOT / "config" / "cities"
EXAMPLES_DIR = ROOT / "examples"
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / ".cache"


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--country", required=True, help="Example directory under examples/, e.g. spain")
    parser.add_argument(
        "--city", default=None,
        help="Only add this city slug from the example (comma-separated for several). "
             "Default: every city in the example.",
    )
    args = parser.parse_args()

    example_dir = EXAMPLES_DIR / args.country
    example_cities_dir = example_dir / "cities"
    if not example_cities_dir.exists():
        available = ", ".join(sorted(p.name for p in EXAMPLES_DIR.iterdir() if p.is_dir()))
        raise SystemExit(f"No example '{args.country}' (looked for {example_cities_dir}).\nAvailable: {available}")

    city_entries = [
        json.loads(p.read_text(encoding="utf-8"))
        for p in sorted(example_cities_dir.glob("*.json"))
        if p.name != "_countries.json"
    ]
    if not city_entries:
        raise SystemExit(f"{example_cities_dir} has no cities - nothing to add.")

    if args.city:
        wanted = set(args.city.split(","))
        found = {c["slug"] for c in city_entries}
        missing = wanted - found
        if missing:
            raise SystemExit(
                f"'{args.country}' has no entry for: {', '.join(sorted(missing))}.\n"
                f"Available in this example: {', '.join(sorted(found))}"
            )
        city_entries = [c for c in city_entries if c["slug"] in wanted]

    CITIES_DIR.mkdir(parents=True, exist_ok=True)
    already = [c["slug"] for c in city_entries if (CITIES_DIR / f"{c['slug']}.json").exists()]
    if already:
        raise SystemExit(
            f"config/cities/ already has: {', '.join(sorted(already))}.\n"
            "Edit those files directly (or remove them) if you want to redo this."
        )

    countries_path = CITIES_DIR / "_countries.json"
    target_registry = (
        json.loads(countries_path.read_text(encoding="utf-8")) if countries_path.exists() else {}
    )
    target_countries = target_registry.setdefault("countries", {})

    example_countries_path = example_cities_dir / "_countries.json"
    example_registry = (
        json.loads(example_countries_path.read_text(encoding="utf-8"))
        if example_countries_path.exists() else {}
    )
    needed_countries = {c["country"] for c in city_entries} - set(target_countries)
    missing_country_entries = needed_countries - set(example_registry.get("countries", {}))
    if missing_country_entries:
        raise SystemExit(
            f"{example_countries_path} references countr{'y' if len(missing_country_entries) == 1 else 'ies'} "
            f"{', '.join(sorted(missing_country_entries))} but has no matching entry under \"countries\"."
        )
    for country in needed_countries:
        target_countries[country] = example_registry["countries"][country]

    added_slugs = {c["slug"] for c in city_entries}
    if "defaultCity" not in target_registry and example_registry.get("defaultCity") in added_slugs:
        target_registry["defaultCity"] = example_registry["defaultCity"]

    countries_path.write_text(json.dumps(target_registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    for city in city_entries:
        city_path = CITIES_DIR / f"{city['slug']}.json"
        city_path.write_text(json.dumps(city, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"✓ Added {', '.join(sorted(added_slugs))} to config/cities/", file=sys.stderr)

    zipped_slugs = []
    for city in city_entries:
        slug, country = city["slug"], city["country"]
        gtfs_src = None
        for kind, dest in (
            ("gtfs", DATA_DIR / "gtfs" / country / slug),
            ("cities", DATA_DIR / "cities" / slug),
        ):
            src = example_dir / kind / slug
            if not src.exists():
                print(f"  ! no {kind}/{slug} in {example_dir} - skipping data copy", file=sys.stderr)
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dest, dirs_exist_ok=True)
            print(f"✓ Copied {kind}/{slug} → {dest.relative_to(ROOT)}", file=sys.stderr)
            if kind == "gtfs":
                gtfs_src = src

        if gtfs_src is not None:
            zip_gtfs(gtfs_src, CACHE_DIR / f"{slug}.gtfs.zip")
            zipped_slugs.append(slug)

    if zipped_slugs:
        generate_routing_binaries(zipped_slugs)

    print("", file=sys.stderr)
    print(f"Ready: make dev", file=sys.stderr)
    print(
        "(Map tiles not included - run `make tiles CITY=<slug>` for the visual "
        "basemap; needs Java or Docker plus a one-time country PBF download.)",
        file=sys.stderr,
    )


def zip_gtfs(gtfs_dir: Path, dest: Path) -> None:
    """Zips a GTFS text-file directory the same way pipeline/cities.py's
    gtfs_zip_path()/import_gtfs.py expect to find it in data/.cache/ -
    generate_transit_data.mjs (the Minotor routing binary generator) reads
    from there, not from the extracted gtfs/<country>/<slug>/ directory."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(gtfs_dir.glob("*.txt")):
            zf.write(f, arcname=f.name)
    print(f"✓ Zipped {gtfs_dir.name} GTFS → {dest.relative_to(ROOT)}", file=sys.stderr)


def generate_routing_binaries(slugs: list[str]) -> None:
    """Runs the same binary-generation step `make data-common` does, so the
    example is immediately routable (offline WASM + services/routing) with
    no extra manual step. Only needs the npm workspace's node_modules
    (`make install`) and the .gtfs.zip files this script just wrote - no
    network access."""
    print(f"Generating routing binaries for {', '.join(slugs)}...", file=sys.stderr)
    try:
        subprocess.run(
            ["node", "pipeline/generate_transit_data.mjs"],
            cwd=ROOT, check=True,
        )
    except FileNotFoundError:
        print(
            "  ! 'node' not found - skipping routing binaries.\n"
            "    Run manually later: node pipeline/generate_transit_data.mjs",
            file=sys.stderr,
        )
    except subprocess.CalledProcessError as exc:
        print(
            f"  ! routing binary generation failed ({exc}).\n"
            "    Have you run `make install`? Then retry: node pipeline/generate_transit_data.mjs",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
