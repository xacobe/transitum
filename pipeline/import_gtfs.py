#!/usr/bin/env python3
"""Imports an official GTFS feed for a city that publishes one, instead of
reconstructing synthetic GTFS from OSM (osm_to_gtfs.py). Some operators
(mainly in Europe, via national/regional open-data portals) publish a real
GTFS with actual timetables - far more complete than what osm_to_gtfs.py can
rebuild from OSM route relation tagging alone.

Downloads the zip, remaps its agency_id(s) to the city's declared
agencyId(s) in cities.json (matched by order - the common case is a single
urban operator, i.e. one agency on each side), and writes it to the same
gtfs_dir()/gtfs_zip_path() locations osm_to_gtfs.py would, so the rest of
the pipeline (gtfs_routes_to_json.py, gtfs_stops_to_json.py,
generate-transit-data) works unchanged regardless of which script produced
the GTFS.

Usage:
    python3 pipeline/import_gtfs.py --city vigo --url https://datos.vigo.org/data/transporte/gtfs_vigo.zip
"""
import argparse
import csv
import io
import urllib.request
import zipfile

from cities import get_city, gtfs_dir, gtfs_zip_path

GTFS_FILES = [
    "agency.txt", "stops.txt", "routes.txt", "trips.txt", "stop_times.txt",
    "calendar.txt", "calendar_dates.txt", "shapes.txt", "fare_attributes.txt",
    "fare_rules.txt", "frequencies.txt", "transfers.txt", "feed_info.txt",
]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--city", required=True, help="City slug (see pipeline/cities.py)")
    parser.add_argument("--url", required=True, help="Direct URL to the official GTFS zip")
    args = parser.parse_args()
    city = get_city(args.city)

    print(f"Downloading {args.url}...")
    req = urllib.request.Request(args.url, headers={"User-Agent": "transitum-import-gtfs/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()

    out_dir = gtfs_dir(city["slug"])
    out_dir.mkdir(parents=True, exist_ok=True)
    # Clear any GTFS files already there first - extractall() only writes
    # what's in the new zip, so a file the OLD source had but this one
    # doesn't (e.g. re-importing over an osm_to_gtfs.py run's
    # frequencies.txt, which official feeds don't have) would otherwise
    # linger and get read by the rest of the pipeline as if still current.
    for name in GTFS_FILES:
        (out_dir / name).unlink(missing_ok=True)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        zf.extractall(out_dir)

    # Remap agency_id(s): the feed's own ids are provider-internal and
    # meaningless outside it (e.g. "1") - rewrite them to the city's
    # declared agencyId(s) so agency_id in routes.txt lines up with
    # cities.json, the same convention osm_to_gtfs.py's synthetic feeds
    # use everywhere else in this pipeline.
    agency_path = out_dir / "agency.txt"
    with open(agency_path, encoding="utf-8-sig", newline="") as f:
        agency_rows = list(csv.DictReader(f))

    if len(agency_rows) != len(city["agencies"]):
        raise SystemExit(
            f"The feed has {len(agency_rows)} agency(ies) but cities.json declares "
            f"{len(city['agencies'])} for '{city['slug']}' - map them by hand "
            "(agency_id columns in agency.txt/routes.txt) before continuing with the rest of the pipeline."
        )

    id_map = {row["agency_id"]: agency["agencyId"] for row, agency in zip(agency_rows, city["agencies"])}
    print(f"Remapping agency_id: {id_map}")

    for row, agency in zip(agency_rows, city["agencies"]):
        row["agency_id"] = agency["agencyId"]
        row["agency_name"] = agency["agencyName"]
        row["agency_url"] = agency["agencyUrl"]
        row["agency_timezone"] = agency["agencyTimezone"]
        row["agency_lang"] = agency["agencyLang"]

    with open(agency_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=agency_rows[0].keys())
        writer.writeheader()
        writer.writerows(agency_rows)

    routes_path = out_dir / "routes.txt"
    with open(routes_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        routes_rows = list(reader)
    for row in routes_rows:
        row["agency_id"] = id_map.get(row["agency_id"], row["agency_id"])
    with open(routes_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(routes_rows)

    # Re-zip with the remapped agency_id so data/.cache/<slug>.gtfs.zip
    # (consumed by generate-transit-data) matches what's on disk in gtfs_dir().
    zip_path = gtfs_zip_path(city["slug"])
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in GTFS_FILES:
            p = out_dir / name
            if p.exists():
                zf.write(p, name)

    print(f"Official GTFS imported to {out_dir}")
    print(f"Zip ready at {zip_path}")


if __name__ == "__main__":
    main()
