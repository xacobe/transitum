#!/usr/bin/env python3
"""Adds a working example country (one or more cities) to config/cities.json and data/.

The framework ships with config/cities.json empty - this is the "easy way to
try one" it points to. Merges the city entries (and the country entry they
need) from examples/<country>/cities.example.json into config/cities.json,
copies that example's pre-generated gtfs/ and cities/ data into data/, and
generates the Minotor routing binaries (timetable.bin + stops.bin) from that
GTFS - so the app, including offline/online route planning, runs immediately
after `make dev`. No network calls needed (no OSM, no live GTFS feed).

Map tiles are the one thing NOT generated here - `make tiles CITY=<slug>`
needs Java or Docker plus a country-level OSM PBF (100MB-1GB+ depending on
country, downloaded once and cached), too heavy for a "try it in 30 seconds"
path. Without it the map falls back to no basemap; run `make tiles` after if
you want the visual map, not just stops/routes/search.

Refuses to add a city whose slug is already in config/cities.json - re-running
this (or `make add-city`) for the same example is a no-op error, not a merge.

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
CITIES_JSON = ROOT / "config" / "cities.json"
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
    example_json = example_dir / "cities.example.json"
    if not example_json.exists():
        available = ", ".join(sorted(p.name for p in EXAMPLES_DIR.iterdir() if p.is_dir()))
        raise SystemExit(f"No example '{args.country}' (looked for {example_json}).\nAvailable: {available}")

    example_data = json.loads(example_json.read_text(encoding="utf-8"))
    city_entries = example_data.get("cities", [])
    if not city_entries:
        raise SystemExit(f"{example_json} has no cities - nothing to add.")

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

    if not CITIES_JSON.exists():
        raise SystemExit(f"{CITIES_JSON} not found - is config/cities.json missing entirely?")
    target_data = json.loads(CITIES_JSON.read_text(encoding="utf-8"))

    existing_slugs = {c["slug"] for c in target_data.get("cities", [])}
    already = [c["slug"] for c in city_entries if c["slug"] in existing_slugs]
    if already:
        raise SystemExit(
            f"config/cities.json already has: {', '.join(sorted(already))}.\n"
            "Edit the file directly (or remove the entry) if you want to redo this."
        )

    target_countries = target_data.setdefault("countries", {})
    needed_countries = {c["country"] for c in city_entries} - set(target_countries)
    missing_country_entries = needed_countries - set(example_data.get("countries", {}))
    if missing_country_entries:
        raise SystemExit(
            f"{example_json} references countr{'y' if len(missing_country_entries) == 1 else 'ies'} "
            f"{', '.join(sorted(missing_country_entries))} but has no matching entry under \"countries\"."
        )
    for country in needed_countries:
        target_countries[country] = example_data["countries"][country]

    target_data.setdefault("cities", []).extend(city_entries)

    added_slugs = {c["slug"] for c in city_entries}
    if "defaultCity" not in target_data and example_data.get("defaultCity") in added_slugs:
        target_data["defaultCity"] = example_data["defaultCity"]

    CITIES_JSON.write_text(json.dumps(target_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"✓ Added {', '.join(sorted(added_slugs))} to config/cities.json", file=sys.stderr)

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
