#!/usr/bin/env python3
"""Imports and merges several official GTFS feeds into one city - for
cities where transit is split across separate operators/modes that each
publish their own feed (a bus company, a metro operator, a tram/rail
operator, ...) with no single combined feed anywhere. import_gtfs.py
covers the common case of one feed, one (or a few) agencies declared in
order; this script is for when that's not enough.

Unlike import_gtfs.py (which takes --url on the command line), this reads
its list of sources from the city's own config/cities/<slug>.json:

    "transitSources": [
      {
        "type": "official-gtfs",
        "url": "https://example.org/bus-operator/gtfs.zip",
        // Keeps only these agency_id(s) from the feed (drops every other
        // agency and everything that only belongs to it - routes, trips,
        // stops, shapes, calendar), and renames each kept one to the
        // given declared agencyId (must be one of the city's own
        // "agencies" entries). A single-agency feed still needs this -
        // it's the only place the rename happens.
        "agencyIds": { "<original agency_id in the feed>": "<declared agencyId>" }
      },
      {
        "type": "official-gtfs",
        "url": "https://example.org/metro-operator/gtfs.zip",
        "agencyIds": { "Metro Co": "METRO" }
      }
    ]

Every ID that could collide across sources (route_id, trip_id, service_id,
shape_id, stop_id, block_id, fare_id) is prefixed with a per-source tag
(the declared agencyId of that source's first kept agency, lowercased) so
two operators' feeds can reuse the same raw IDs without clashing once
merged. Writes to the same gtfs_dir()/gtfs_zip_path() locations
import_gtfs.py and osm_to_gtfs.py do, so the rest of the pipeline
(gtfs_routes_to_json.py, gtfs_stops_to_json.py, generate-transit-data)
works unchanged regardless of how the GTFS was assembled.

Usage:
    python3 pipeline/import_gtfs_multi.py --city bilbao
"""
import argparse
import io
import re
import urllib.request
import zipfile
from pathlib import Path

from cities import get_city, gtfs_dir, gtfs_zip_path
from gtfs_io import GTFS_FILES, read_csv_rows, write_csv_rows


DOWNLOAD_RETRIES = 4


def download_gtfs(url: str) -> Path:
    # Some open-data portals (Euskotren's own gtfs.euskotren.eus, observed
    # in practice) intermittently cut the transfer short well before
    # Content-Length - not a timeout (each attempt returns quickly with a
    # truncated body), so retrying whole-request a few times is more
    # effective here than a longer single timeout.
    print(f"  downloading {url}...")
    last_error: Exception | None = None
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        req = urllib.request.Request(url, headers={"User-Agent": "transitum-import-gtfs-multi/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read()
            tmp_dir = Path("/tmp") / f"transitum-gtfs-src-{abs(hash(url))}"
            tmp_dir.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                zf.extractall(tmp_dir)
            return tmp_dir
        except (zipfile.BadZipFile, OSError) as exc:
            last_error = exc
            print(f"    attempt {attempt}/{DOWNLOAD_RETRIES} failed ({exc}) - retrying...")
    raise SystemExit(f"Failed to download a valid zip from {url} after {DOWNLOAD_RETRIES} attempts: {last_error}")


def slugify_tag(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def process_source(source: dict) -> dict[str, list[dict]]:
    """Downloads one feed, keeps only the declared agencies (and
    everything that cascades from them), remaps agency_id, and prefixes
    every cross-referenced ID with this source's tag. Returns one list of
    rows per GTFS file (unprefixed filenames, e.g. "stops" not
    "stops.txt" - merge_sources() writes those out)."""
    src_dir = download_gtfs(source["url"])
    agency_map: dict[str, str] = source["agencyIds"]
    tag = slugify_tag(next(iter(agency_map.values())))

    raw_agency_rows = read_csv_rows(src_dir / "agency.txt")
    agency_rows = [r for r in raw_agency_rows if r["agency_id"] in agency_map]
    found_ids = {r["agency_id"] for r in agency_rows}
    missing = set(agency_map) - found_ids
    if missing:
        raise SystemExit(
            f"{source['url']}: agencyIds references agency_id(s) not present in the "
            f"feed's agency.txt: {sorted(missing)}"
        )

    # GTFS allows omitting route.agency_id when the feed declares exactly
    # one agency (it's then implicit, per spec) - Metro Bilbao's feed does
    # this. Fill it in so the agency_map filter below still applies.
    implicit_agency_id = raw_agency_rows[0]["agency_id"] if len(raw_agency_rows) == 1 else None

    routes_rows = read_csv_rows(src_dir / "routes.txt")
    for r in routes_rows:
        if not r.get("agency_id"):
            r["agency_id"] = implicit_agency_id
    routes_rows = [r for r in routes_rows if r["agency_id"] in agency_map]
    kept_route_ids = {r["route_id"] for r in routes_rows}

    trips_rows = read_csv_rows(src_dir / "trips.txt")
    trips_rows = [r for r in trips_rows if r["route_id"] in kept_route_ids]
    kept_trip_ids = {r["trip_id"] for r in trips_rows}
    kept_service_ids = {r["service_id"] for r in trips_rows if r.get("service_id")}
    kept_shape_ids = {r["shape_id"] for r in trips_rows if r.get("shape_id")}

    stop_times_rows = read_csv_rows(src_dir / "stop_times.txt")
    stop_times_rows = [r for r in stop_times_rows if r["trip_id"] in kept_trip_ids]
    referenced_stop_ids = {r["stop_id"] for r in stop_times_rows if r.get("stop_id")}

    # Stops referenced by a kept stop_time, plus their parent_station chain
    # (a platform's parent station wouldn't otherwise be reachable from
    # stop_times.txt, which only ever references the platform-level stop).
    stops_by_id = {r["stop_id"]: r for r in read_csv_rows(src_dir / "stops.txt")}
    kept_stop_ids: set[str] = set()
    for stop_id in referenced_stop_ids:
        while stop_id and stop_id not in kept_stop_ids and stop_id in stops_by_id:
            kept_stop_ids.add(stop_id)
            stop_id = stops_by_id[stop_id].get("parent_station")
    stops_rows = [r for sid, r in stops_by_id.items() if sid in kept_stop_ids]

    calendar_rows = [r for r in read_csv_rows(src_dir / "calendar.txt") if r["service_id"] in kept_service_ids]
    calendar_dates_rows = [
        r for r in read_csv_rows(src_dir / "calendar_dates.txt") if r["service_id"] in kept_service_ids
    ]
    shapes_rows = [r for r in read_csv_rows(src_dir / "shapes.txt") if r["shape_id"] in kept_shape_ids]
    frequencies_rows = [r for r in read_csv_rows(src_dir / "frequencies.txt") if r["trip_id"] in kept_trip_ids]
    transfers_rows = [
        r for r in read_csv_rows(src_dir / "transfers.txt")
        if r.get("from_stop_id") in kept_stop_ids and r.get("to_stop_id") in kept_stop_ids
    ]

    def pfx(value: str | None) -> str | None:
        return f"{tag}:{value}" if value else value

    for r in agency_rows:
        r["agency_id"] = agency_map[r["agency_id"]]
    for r in routes_rows:
        r["agency_id"] = agency_map[r["agency_id"]]
        r["route_id"] = pfx(r["route_id"])
        if r.get("fare_id"):
            r["fare_id"] = pfx(r["fare_id"])
    for r in trips_rows:
        r["route_id"] = pfx(r["route_id"])
        r["trip_id"] = pfx(r["trip_id"])
        r["service_id"] = pfx(r["service_id"])
        if r.get("shape_id"):
            r["shape_id"] = pfx(r["shape_id"])
        if r.get("block_id"):
            r["block_id"] = pfx(r["block_id"])
    for r in stop_times_rows:
        r["trip_id"] = pfx(r["trip_id"])
        r["stop_id"] = pfx(r["stop_id"])
    for r in stops_rows:
        r["stop_id"] = pfx(r["stop_id"])
        if r.get("parent_station"):
            r["parent_station"] = pfx(r["parent_station"])
    for r in calendar_rows:
        r["service_id"] = pfx(r["service_id"])
    for r in calendar_dates_rows:
        r["service_id"] = pfx(r["service_id"])
    for r in shapes_rows:
        r["shape_id"] = pfx(r["shape_id"])
    for r in frequencies_rows:
        r["trip_id"] = pfx(r["trip_id"])
    for r in transfers_rows:
        r["from_stop_id"] = pfx(r["from_stop_id"])
        r["to_stop_id"] = pfx(r["to_stop_id"])

    fare_attributes_rows = read_csv_rows(src_dir / "fare_attributes.txt")
    fare_rules_rows = [r for r in read_csv_rows(src_dir / "fare_rules.txt") if r.get("route_id") in kept_route_ids]
    kept_fare_ids = {r["fare_id"] for r in fare_rules_rows}
    fare_attributes_rows = [r for r in fare_attributes_rows if r["fare_id"] in kept_fare_ids]
    for r in fare_attributes_rows:
        r["fare_id"] = pfx(r["fare_id"])
    for r in fare_rules_rows:
        r["fare_id"] = pfx(r["fare_id"])
        r["route_id"] = pfx(r["route_id"])

    print(
        f"  [{tag}] kept {len(agency_rows)} agency(ies), {len(routes_rows)} routes, "
        f"{len(trips_rows)} trips, {len(stops_rows)} stops"
    )

    return {
        "agency": agency_rows,
        "routes": routes_rows,
        "trips": trips_rows,
        "stop_times": stop_times_rows,
        "stops": stops_rows,
        "calendar": calendar_rows,
        "calendar_dates": calendar_dates_rows,
        "shapes": shapes_rows,
        "frequencies": frequencies_rows,
        "transfers": transfers_rows,
        "fare_attributes": fare_attributes_rows,
        "fare_rules": fare_rules_rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--city", required=True, help="City slug (see pipeline/cities.py)")
    args = parser.parse_args()
    city = get_city(args.city)

    sources = city.get("transitSources")
    if not sources:
        raise SystemExit(
            f"'{city['slug']}' has no \"transitSources\" array in its config/cities/{city['slug']}.json.\n"
            "Single-feed cities should use import_gtfs.py instead."
        )

    print(f"Importing {len(sources)} source(s) for '{city['slug']}'...")
    merged: dict[str, list[dict]] = {name: [] for name in [
        "agency", "routes", "trips", "stop_times", "stops", "calendar",
        "calendar_dates", "shapes", "frequencies", "transfers",
        "fare_attributes", "fare_rules",
    ]}
    for source in sources:
        result = process_source(source)
        for key, rows in result.items():
            merged[key].extend(rows)

    declared_agency_ids = {a["agencyId"] for a in city["agencies"]}
    merged_agency_ids = {r["agency_id"] for r in merged["agency"]}
    if merged_agency_ids != declared_agency_ids:
        raise SystemExit(
            f"Merged agency_id set {sorted(merged_agency_ids)} doesn't match "
            f"'{city['slug']}'s declared agencies {sorted(declared_agency_ids)} - "
            "check each source's \"agencyIds\" mapping and the city's \"agencies\" list agree."
        )

    out_dir = gtfs_dir(city["slug"])
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in GTFS_FILES:
        (out_dir / name).unlink(missing_ok=True)
    for name, rows in merged.items():
        write_csv_rows(out_dir / f"{name}.txt", rows)

    zip_path = gtfs_zip_path(city["slug"])
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in GTFS_FILES:
            p = out_dir / name
            if p.exists():
                zf.write(p, name)

    total_routes = len(merged["routes"])
    total_stops = len(merged["stops"])
    print(f"Merged GTFS written to {out_dir} ({total_routes} routes, {total_stops} stops)")
    print(f"Zip ready at {zip_path}")


if __name__ == "__main__":
    main()
