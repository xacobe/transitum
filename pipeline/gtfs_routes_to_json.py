#!/usr/bin/env python3
"""Converts routes/trips/stop_times/shapes from <city>-gtfs into a static
JSON with, for each line and destination variant, the route geometry (to
draw it on the map) and its stops in order.

A "direction_id" (0/1) is not always a single path: real lines commonly
branch into several final destinations that share a common trunk (e.g.
Vigo's line 7 direction 0 splits into 5 destinations - Valadares, Seoane,
Zamans x2, Sobreira). Each distinct trip_headsign within a direction_id
becomes its own entry in "directions" (still called that in the JSON/
frontend for compatibility) with its own geometry/stops/frequency, rather
than collapsing them into one arbitrary representative path that silently
drops every stop only served by a different branch. A route with no
branching (the common case, and the only case for OSM-synthetic feeds -
see osm_to_gtfs.py) still produces exactly one entry per direction_id, so
this is a superset of the old behavior, not a breaking change for it.

Same pattern as gtfs_stops_to_json.py: none of this changes with the
synthetic frequency (only the times change), so a static JSON avoids
querying OTP live (frontend/src/views/LineView.vue).
"""
import csv
import json
import re
import statistics
from collections import Counter, defaultdict

from cities import frontend_public_data_dir, gtfs_dir, parse_city_arg

# Plenty of precision to draw the line on the map (~1m) - trims the JSON
# size with no visible loss.
SHAPE_COORD_DECIMALS = 5


def normalize_hex_color(value):
    """GTFS route_color/route_text_color are 6 hex digits with no leading
    '#', and the field is optional - returns None for missing/malformed
    values so the frontend can tell "no official color" apart from a real
    one, rather than silently falling back to a made-up default here.
    """
    value = (value or "").strip().lstrip("#")
    if re.fullmatch(r"[0-9a-fA-F]{6}", value):
        return f"#{value.lower()}"
    return None


def natural_sort_key(short_name):
    """'2B' < '4' < '10' < '12' instead of pure alphabetical order."""
    match = re.match(r"(\d+)(.*)", short_name)
    if match:
        return (int(match.group(1)), match.group(2))
    return (float("inf"), short_name)


def to_seconds(hhmmss):
    h, m, s = (int(x) for x in hhmmss.split(":"))
    return h * 3600 + m * 60 + s


def compute_frequency_periods(direction_trips, stop_times_by_trip, frequencies_by_trip, city_periods):
    """Real per-line headway for each of the city's time-of-day bands, from
    the timetable itself rather than a single city-wide config value - works
    whether this direction is frequency-based (osm_to_gtfs.py's synthetic
    output, or an official feed that itself publishes frequencies.txt for
    some of its trips - real agencies do this for high-frequency routes) or
    schedule-based (one row per actual departure, whatever the feed's
    transitSource): frequency-based directions report their own
    headway_secs directly; schedule-based ones use the median gap between
    consecutive departures from this direction's first stop, bucketed into
    the same bands. Only bands with enough data are returned - the frontend
    falls back to the city default for anything missing (e.g. a night line
    with too few trips to make a meaningful median).

    Returns (periods_out, has_fixed_schedule) - the second value is set once
    per direction (not per band): whether this direction's own trips have
    real per-trip departure times to fall back on, regardless of how many
    bands ended up with enough data for a period. Not to be confused with
    transitSource.type on the city as a whole - a single official-gtfs feed
    can freely mix schedule-based and frequency-based directions (or an
    OSM-synthetic city could in principle mix too, though osm_to_gtfs.py
    doesn't do that today).
    """
    band_headways = {}  # (start, end) -> list of headwaySeconds observed

    freq_rows = [row for t in direction_trips for row in frequencies_by_trip.get(t["trip_id"], [])]
    has_fixed_schedule = not bool(freq_rows)
    if freq_rows:
        for period in city_periods:
            for row in freq_rows:
                if row["start_time"] == period["start"] and row["end_time"] == period["end"]:
                    band_headways.setdefault((period["start"], period["end"]), []).append(
                        int(row["headway_secs"])
                    )
                    break
    else:
        departures = []
        for t in direction_trips:
            times = stop_times_by_trip.get(t["trip_id"], [])
            if not times:
                continue
            first = min(times, key=lambda st: int(st["stop_sequence"]))
            departures.append(to_seconds(first["departure_time"]))
        departures.sort()
        for period in city_periods:
            pstart, pend = to_seconds(period["start"]), to_seconds(period["end"])
            in_band = [d for d in departures if pstart <= d < pend]
            if len(in_band) < 2:
                continue
            gaps = [b - a for a, b in zip(in_band, in_band[1:])]
            band_headways[(period["start"], period["end"])] = [round(statistics.median(gaps))]

    periods_out = []
    for period in city_periods:
        headways = band_headways.get((period["start"], period["end"]))
        if not headways:
            continue
        periods_out.append(
            {
                "start": period["start"],
                "end": period["end"],
                "headwaySeconds": round(statistics.median(headways)),
                "reliability": period["reliability"],
            }
        )
    return periods_out, has_fixed_schedule


def main():
    city = parse_city_arg(__doc__)
    feed_id_prefix = f"{city['feedId']}:"
    gtfs_path = gtfs_dir(city["slug"])
    # In public/, not in src/data/: Vite truncates the content when
    # wrapping a JSON of this size (~600KB) as a dynamic import()
    # (bug/limit confirmed live with Vite 8.1.0 - JSON.parse() failed
    # halfway through the file). As a static asset in public/ it's served
    # as-is, without going through that transform.
    output_path = frontend_public_data_dir(city["slug"]) / "routes.json"

    with open(gtfs_path / "stops.txt", encoding="utf-8") as f:
        stops_by_id = {row["stop_id"]: row for row in csv.DictReader(f)}

    with open(gtfs_path / "routes.txt", encoding="utf-8") as f:
        routes = list(csv.DictReader(f))

    # Name lookup for the agency_id routes.txt already carries (written by
    # osm_to_gtfs.py) - includes the synthetic fallback agency too, in case
    # any route ended up unattributed and wasn't curated away yet.
    agency_names = {a["agencyId"]: a["agencyName"] for a in city["agencies"]}
    agency_names.setdefault(city["defaultAgencyId"], "Operador desconocido")

    with open(gtfs_path / "trips.txt", encoding="utf-8") as f:
        trips = list(csv.DictReader(f))

    # All trips grouped by (route_id, direction_id, headsign) - the unit a
    # single "directions" entry is built from. Headsign is stripped before
    # grouping: real feeds carry the same destination with inconsistent
    # trailing whitespace (e.g. Vigo's "...por G. VIA" vs "...por G. VIA ")
    # which would otherwise look like two branches when it's really one.
    # OSM-synthetic feeds always have exactly one headsign per direction
    # (verified against the Burkina Faso fixtures), so this produces the
    # same single group per direction there - a no-op generalization.
    trips_by_variant = defaultdict(list)
    for trip in trips:
        key = (trip["route_id"], trip["direction_id"], trip["trip_headsign"].strip())
        trips_by_variant[key].append(trip)

    frequencies_by_trip = {}
    try:
        with open(gtfs_path / "frequencies.txt", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                frequencies_by_trip.setdefault(row["trip_id"], []).append(row)
    except FileNotFoundError:
        pass  # schedule-based feed (e.g. an official GTFS import) - no frequencies.txt

    stop_times_by_trip = {}
    with open(gtfs_path / "stop_times.txt", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            stop_times_by_trip.setdefault(row["trip_id"], []).append(row)

    shape_points_by_id = {}
    with open(gtfs_path / "shapes.txt", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            shape_points_by_id.setdefault(row["shape_id"], []).append(row)
    for points in shape_points_by_id.values():
        points.sort(key=lambda p: int(p["shape_pt_sequence"]))

    routes_out = []
    for route in routes:
        this_short_name = route["route_short_name"]

        # This route's destination variants, most-used first within each
        # direction_id (so the busiest branch is the default-selected chip
        # in LineView) - direction 0 before direction 1.
        variant_keys = [k for k in trips_by_variant if k[0] == route["route_id"]]
        variant_keys.sort(key=lambda k: (k[1], -len(trips_by_variant[k])))

        directions = []
        for key in variant_keys:
            _, direction_id, headsign = key
            variant_trips = trips_by_variant[key]

            # Representative trip for this variant's polyline: the
            # most-used shape_id within it (not an arbitrary first-in-file
            # one), so the drawn line matches what most of its trips run.
            majority_shape = Counter(t["shape_id"] for t in variant_trips).most_common(1)[0][0]
            trip = next(t for t in variant_trips if t["shape_id"] == majority_shape)

            # Stops: the representative trip's own sequence first (keeps map
            # marker order sane), then any additional stops only served by
            # a different shape variant sharing this same destination.
            seen_stop_ids = set()
            stop_times = []
            for t in [trip] + [t for t in variant_trips if t is not trip]:
                for st in sorted(stop_times_by_trip.get(t["trip_id"], []), key=lambda st: int(st["stop_sequence"])):
                    if st["stop_id"] in seen_stop_ids:
                        continue
                    seen_stop_ids.add(st["stop_id"])
                    stop_times.append(st)
            stops = [
                {
                    "id": f"{feed_id_prefix}{st['stop_id']}",
                    "name": stops_by_id[st["stop_id"]]["stop_name"],
                    "lat": float(stops_by_id[st["stop_id"]]["stop_lat"]),
                    "lon": float(stops_by_id[st["stop_id"]]["stop_lon"]),
                }
                for st in stop_times
            ]
            points = [
                [
                    round(float(p["shape_pt_lat"]), SHAPE_COORD_DECIMALS),
                    round(float(p["shape_pt_lon"]), SHAPE_COORD_DECIMALS),
                ]
                for p in shape_points_by_id.get(trip["shape_id"], [])
            ]
            # Other shape_ids sharing this same headsign (minor path
            # deviations too small/noisy to deserve their own destination
            # chip, e.g. line 29's "PRAZA ESPAÑA" has 6) - drawn dashed by
            # the frontend so the stops-union above always has a visible
            # line near it, instead of looking stranded off the one drawn
            # path. Ordered by trip count so the least-used ones don't
            # visually dominate.
            other_shape_ids = [
                s for s, _ in Counter(t["shape_id"] for t in variant_trips if t["shape_id"] != trip["shape_id"]).most_common()
            ]
            extra_paths = [
                [
                    [
                        round(float(p["shape_pt_lat"]), SHAPE_COORD_DECIMALS),
                        round(float(p["shape_pt_lon"]), SHAPE_COORD_DECIMALS),
                    ]
                    for p in shape_points_by_id.get(shape_id, [])
                ]
                for shape_id in other_shape_ids
            ]
            # Frequency, restricted to this variant's own majority
            # service_id - real feeds mix weekday/Saturday/Sunday-shaped
            # service_ids in the same trips.txt, and blending them would
            # make headways look shorter than they really are on any
            # single day.
            majority_service_id = Counter(t["service_id"] for t in variant_trips).most_common(1)[0][0]
            freq_trips = [t for t in variant_trips if t["service_id"] == majority_service_id]
            frequency_periods, has_fixed_schedule = compute_frequency_periods(
                freq_trips,
                stop_times_by_trip,
                frequencies_by_trip,
                city["schedule"]["frequencyPeriods"],
            )
            directions.append(
                {
                    "headsign": headsign,
                    "points": points,
                    "extraPaths": extra_paths,
                    "stops": stops,
                    "frequencyPeriods": frequency_periods,
                    # Whether this specific direction has real per-trip
                    # departure times to fall back on (vs. a published
                    # frequencies.txt band) - see compute_frequency_periods's
                    # docstring. Independent of the city's transitSource.
                    "hasFixedSchedule": has_fixed_schedule,
                }
            )

        if not directions:
            # No trip in either direction for this route_id - e.g. a
            # variant that only runs outside the feed's current calendar
            # window. Listing it would show a dead end (no map, no stops).
            continue

        long_name = route["route_long_name"]
        if not long_name and directions:
            first_dir_stops = directions[0]["stops"]
            if first_dir_stops:
                long_name = f"{first_dir_stops[0]['name']} - {first_dir_stops[-1]['name']}"

        routes_out.append(
            {
                "shortName": this_short_name,
                "longName": long_name,
                "agencyId": route["agency_id"],
                "agencyName": agency_names.get(route["agency_id"], route["agency_id"]),
                # Official color from the source GTFS, if any (osm_to_gtfs.py's
                # synthetic feeds never set these - only official-gtfs imports
                # do). Frontend decides whether to actually use it
                # (cities.json's useOfficialLineColors, opt-in per city) -
                # kept here regardless so flipping that switch later needs
                # no pipeline re-run.
                "color": normalize_hex_color(route.get("route_color")),
                "textColor": normalize_hex_color(route.get("route_text_color")),
                "directions": directions,
            }
        )

    routes_out.sort(key=lambda r: natural_sort_key(r["shortName"]))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        # No indent (unlike stops.json/pois.json): this file is mostly
        # coordinate arrays for each line's geometry, and indenting
        # multiplies its size several times over (one number per line).
        # It's never edited by hand, so no useful readability is lost -
        # and this file is only loaded when entering the Lignes section
        # (fetch() in useLocalRoutes.js), not in the main bundle, but it
        # still pays to keep it small (2G/3G).
        json.dump(routes_out, f, ensure_ascii=False, separators=(",", ":"))

    # routes-meta.json: same structure but without points geometry.
    # Used by fetchStopFromData (StopView) which only needs stop IDs/names —
    # 5-10x smaller than routes.json, avoids downloading polylines just to
    # look up which lines stop at a given stop.
    meta_out = [
        {**r, "directions": [{k: v for k, v in d.items() if k not in ("points", "extraPaths")} for d in r["directions"]]}
        for r in routes_out
    ]
    meta_path = output_path.parent / "routes-meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta_out, f, ensure_ascii=False, separators=(",", ":"))

    print(f"{len(routes_out)} lines written to {output_path} + {meta_path.name}")


if __name__ == "__main__":
    main()
