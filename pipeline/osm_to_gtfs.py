#!/usr/bin/env python3
"""Generates a synthetic GTFS feed for a city's bus network from OpenStreetMap.

OSM has the network's real topology (stops, platforms, street segments,
route order) but the operator doesn't publish timetables. This script builds
a synthetic, frequency-based schedule (frequencies.txt - a headway per
time-of-day period, not literal departure times) + estimated travel
time from the distance between stops and an assumed average speed. It
also reconstructs each line's real polyline (shapes.txt) by chaining
the street segments (ways) that make up each route relation.

Technical note: Overpass's public server returns 406 when a query
combines a union of selectors (or several IDs) with the "out geom"
modifier. That's why "ways" are requested here with only "out body"
(node references), and those nodes' coordinates are resolved separately,
same as the stops.
"""
import csv
import math
import time
import zipfile
from datetime import date, timedelta
from pathlib import Path

from cities import gtfs_dir, gtfs_zip_path, parse_city_arg, resolve_agency_id
from overpass import area_filter, overpass_query

NODE_BATCH_SIZE = 500
WAY_BATCH_SIZE = 400


def fetch_route_relations(
    area_name: str, bbox: dict | None = None, admin_level: str | None = None
) -> list[dict]:
    # A global [bbox:...] intersects every statement with the city's own
    # searchBbox. Without it, area["name"=...] alone can silently pull in
    # same-named areas elsewhere in the world (e.g. "Vigo" the English
    # village near Gravesend, Kent, as well as "Vigo" the Galician city) -
    # any relation truly in the city is inside its own bbox by definition,
    # so this can only drop false positives, never real data. See
    # overpass.py::area_filter for the same-country disambiguation
    # (boundary=administrative + optional admin_level) this alone doesn't
    # cover - both matter, neither replaces the other.
    bbox_clause = ""
    if bbox:
        bbox_clause = f"[bbox:{bbox['minLat']},{bbox['minLon']},{bbox['maxLat']},{bbox['maxLon']}]"
    query = f"""
    [out:json][timeout:180]{bbox_clause};
    area{area_filter(area_name, admin_level)}->.a;
    relation["route"="bus"](area.a);
    out body;
    """
    print("Downloading bus relations from Overpass (area query)...")
    data = overpass_query(query)
    relations = [el for el in data["elements"] if el["type"] == "relation"]

    if not relations and bbox:
        # Overpass area["name"=...] can return empty when the area name doesn't
        # match exactly or the area index lags. Fall back to a direct bbox query
        # using the city's searchBbox. Overpass bbox order: south,west,north,east.
        b = f"{bbox['minLat']},{bbox['minLon']},{bbox['maxLat']},{bbox['maxLon']}"
        query_bbox = f"""
        [out:json][timeout:180];
        relation["route"="bus"]({b});
        out body;
        """
        print(f"  0 results with area - retrying with bbox {b}...")
        data = overpass_query(query_bbox)
        relations = [el for el in data["elements"] if el["type"] == "relation"]
        print(f"  {len(relations)} relations found via bbox.")

    return relations


def fetch_nodes(node_ids: set[int]) -> dict[int, dict]:
    nodes = {}
    ids = sorted(node_ids)
    for i in range(0, len(ids), NODE_BATCH_SIZE):
        batch = ids[i : i + NODE_BATCH_SIZE]
        id_list = ",".join(str(n) for n in batch)
        query = f"[out:json][timeout:180];node(id:{id_list});out body;"
        print(f"Downloading nodes {i + len(batch)}/{len(ids)}...")
        data = overpass_query(query)
        for el in data["elements"]:
            if el["type"] == "node":
                nodes[el["id"]] = el
        time.sleep(1)
    return nodes


def fetch_ways_meta(way_ids: set[int]) -> dict[int, dict]:
    """Fetches the ways (only node references, no coordinates: see module note)."""
    ways = {}
    ids = sorted(way_ids)
    for i in range(0, len(ids), WAY_BATCH_SIZE):
        batch = ids[i : i + WAY_BATCH_SIZE]
        id_list = ",".join(str(n) for n in batch)
        query = f"[out:json][timeout:180];way(id:{id_list});out body;"
        print(f"Downloading street segments {i + len(batch)}/{len(ids)}...")
        data = overpass_query(query)
        for el in data["elements"]:
            if el["type"] == "way":
                ways[el["id"]] = el
        time.sleep(1)
    return ways


def haversine_m(lat1, lon1, lat2, lon2) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def ordered_stop_refs(relation: dict) -> list[int]:
    members = relation["members"]
    platforms = [m["ref"] for m in members if m["type"] == "node" and m["role"] == "platform"]
    stops = [m["ref"] for m in members if m["type"] == "node" and m["role"] == "stop"]
    refs = platforms if len(platforms) >= 2 else stops
    if len(refs) < 2:
        # Some mappers add stop nodes as plain members with no role at all
        # (looser than strict PTv2's "platform"/"stop", but a real and not
        # uncommon convention) - fall back to unroled node members rather
        # than discarding a route that clearly has stops, just not
        # explicitly roled as such. Only a fallback: never overrides a
        # relation that already has valid platform/stop members.
        unroled = [m["ref"] for m in members if m["type"] == "node" and m["role"] == ""]
        if len(unroled) >= 2:
            refs = unroled
    deduped = []
    for r in refs:
        if not deduped or deduped[-1] != r:
            deduped.append(r)
    return deduped


def ordered_way_refs(relation: dict) -> list[int]:
    return [m["ref"] for m in relation["members"] if m["type"] == "way"]


def _remove_shape_hooks(
    points: list[tuple[float, float]],
) -> list[tuple[float, float]]:
    """Remove hook artifacts caused by OSM way-stitching: a node where the
    incoming and outgoing segments form an angle >150° is a junction error
    (often a shared endpoint that is slightly behind the travel direction).
    Iterates up to 5 passes because removing one hook can expose another."""
    import math

    threshold = math.radians(150)
    arr = points
    for _ in range(5):
        if len(arr) < 3:
            break
        out = [arr[0]]
        removed = False
        for i in range(1, len(arr) - 1):
            prev, cur, nxt = out[-1], arr[i], arr[i + 1]
            cos_lat = math.cos(math.radians(cur[0]))
            ax = (cur[1] - prev[1]) * cos_lat
            ay = cur[0] - prev[0]
            bx = (nxt[1] - cur[1]) * cos_lat
            by = nxt[0] - cur[0]
            a_len = math.sqrt(ax * ax + ay * ay)
            b_len = math.sqrt(bx * bx + by * by)
            if a_len * 111_000 < 2:   # near-duplicate node: drop silently
                removed = True
                continue
            if b_len * 111_000 < 2:   # next segment degenerate: keep current
                out.append(cur)
                continue
            cos_theta = max(-1.0, min(1.0, (ax * bx + ay * by) / (a_len * b_len)))
            if math.acos(cos_theta) < threshold:
                out.append(cur)
            else:
                removed = True          # hook point: drop
        out.append(arr[-1])
        arr = out
        if not removed:
            break
    return arr


def build_shape_points(
    way_refs: list[int], ways_meta: dict[int, dict], nodes: dict[int, dict]
) -> list[tuple[float, float]]:
    """Chains a relation's street segments (ways) into one continuous polyline.

    The order of ways within a PTv2 relation follows the route, but the
    orientation of each individual segment isn't guaranteed. Each segment
    is oriented based on whichever of its two ends is closer to the last
    accumulated point (instead of requiring it to share the exact same
    node id, which fails when the mapping has small gaps). If the closest
    end is still far (a real gap in the OSM mapping), it's concatenated
    anyway and the jump is accepted.
    A hook-removal pass is applied at the end to clean up stitching
    artifacts where a shared endpoint is slightly off the travel direction.
    """
    points: list[tuple[float, float]] = []
    last_point = None
    for wref in way_refs:
        way = ways_meta.get(wref)
        if not way:
            continue
        node_ids = [n for n in way.get("nodes", []) if n in nodes]
        if len(node_ids) < 2:
            continue
        coords = [(nodes[n]["lat"], nodes[n]["lon"]) for n in node_ids]
        if last_point is not None:
            d_start = haversine_m(*last_point, *coords[0])
            d_end = haversine_m(*last_point, *coords[-1])
            if d_end < d_start:
                coords = coords[::-1]
            if haversine_m(*last_point, *coords[0]) < 2.0:
                coords = coords[1:]
                # Re-check orientation after dedup: the new first node might be
                # a detour behind the last accumulated point.
                if len(coords) >= 2:
                    d_s = haversine_m(*last_point, *coords[0])
                    d_e = haversine_m(*last_point, *coords[-1])
                    if d_e < d_s:
                        coords = coords[::-1]
        points.extend(coords)
        if coords:
            last_point = coords[-1]
    return _remove_shape_hooks(points)


def slugify_route_id(ref: str) -> str:
    return "R_" + "".join(c if c.isalnum() else "_" for c in ref).strip("_")


def seconds_to_gtfs_time(total_seconds: float) -> str:
    total = round(total_seconds)
    hh = total // 3600
    mm = (total % 3600) // 60
    ss = total % 60
    return f"{hh:02d}:{mm:02d}:{ss:02d}"


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]) -> None:
    with open(path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    city = parse_city_arg(__doc__)
    output_dir = gtfs_dir(city["slug"])
    zip_path = gtfs_zip_path(city["slug"])

    osm_cfg = city["osmPatches"]
    relations = fetch_route_relations(osm_cfg["areaName"], city.get("searchBbox"), osm_cfg.get("adminLevel"))

    usable = []
    skipped = []
    for rel in relations:
        if rel["id"] in osm_cfg["duplicateRelationIds"]:
            skipped.append((rel["id"], "manual duplicate: stale mapping of another already-included line"))
            continue
        if rel["id"] in osm_cfg.get("excludeRelationIds", []):
            skipped.append((rel["id"], "manually excluded: outside the urban network's scope"))
            continue
        ref = rel.get("tags", {}).get("ref")
        if not ref:
            skipped.append((rel["id"], "no 'ref' tag"))
            continue
        ref = osm_cfg["refAliases"].get(ref, ref)
        rel["tags"]["ref"] = ref
        stop_refs = ordered_stop_refs(rel)
        if len(stop_refs) < 2:
            skipped.append((rel["id"], f"ref={ref}: fewer than 2 stops tagged in OSM"))
            continue
        way_refs = ordered_way_refs(rel)
        usable.append((rel, stop_refs, way_refs))

    all_stop_node_ids = {nid for _, refs, _ in usable for nid in refs}
    all_way_ids = {wid for _, _, wrefs in usable for wid in wrefs}
    print(
        f"{len(usable)} usable relations, {len(skipped)} discarded, "
        f"{len(all_stop_node_ids)} unique stops, {len(all_way_ids)} street segments to resolve."
    )

    ways_meta = fetch_ways_meta(all_way_ids)
    all_way_node_ids = {nid for way in ways_meta.values() for nid in way.get("nodes", [])}
    nodes = fetch_nodes(all_stop_node_ids | all_way_node_ids)

    # Rolling one-year window from whenever this actually runs, not a fixed
    # date - a hardcoded end_date works fine until it doesn't: routing goes
    # dead for every OSM-synthetic city the day the calendar expires,
    # including ones regenerated since (same fixed date baked in again).
    # Re-running the pipeline (the daily sync, or `make data`) keeps pushing
    # this window forward; a city whose OSM data genuinely never changes
    # still won't regenerate via the sync workflow, but now has up to a
    # year of margin instead of a hard cliff on a specific day.
    today = date.today()
    calendar_rows = [
        {
            "service_id": "DAILY",
            "monday": 1,
            "tuesday": 1,
            "wednesday": 1,
            "thursday": 1,
            "friday": 1,
            "saturday": 1,
            "sunday": 1,
            "start_date": today.strftime("%Y%m%d"),
            "end_date": (today + timedelta(days=365)).strftime("%Y%m%d"),
        }
    ]

    stops_by_id = {}
    routes_by_id = {}
    trips_rows = []
    stop_times_rows = []
    shapes_rows = []
    frequencies_rows = []
    direction_counter = {}
    relations_with_shape = 0
    relations_without_shape = 0
    routes_per_agency = {}

    schedule = city["schedule"]
    speed_m_s = schedule["averageSpeedKmh"] * 1000 / 3600

    for rel, stop_refs, way_refs in usable:
        tags = rel.get("tags", {})
        ref = tags["ref"]
        agency_id = resolve_agency_id(city, tags.get("operator"))
        # The agency id is part of the route's identity, not just a label:
        # two different companies are allowed to both call a line "12" -
        # without this prefix they'd collide into a single GTFS route.
        route_id = slugify_route_id(f"{agency_id}_{ref}")
        if route_id not in routes_by_id:
            routes_by_id[route_id] = {
                "route_id": route_id,
                "agency_id": agency_id,
                "route_short_name": ref,
                "route_long_name": f"{tags.get('from', '')} - {tags.get('to', '')}".strip(" -"),
                "route_type": 3,
            }
            routes_per_agency[agency_id] = routes_per_agency.get(agency_id, 0) + 1

        cleaned = []
        for nid in stop_refs:
            node = nodes.get(nid)
            if node is None:
                continue
            stop_id = f"OSM{nid}"
            if stop_id not in stops_by_id:
                ntags = node.get("tags", {})
                stops_by_id[stop_id] = {
                    "stop_id": stop_id,
                    "stop_name": ntags.get("name") or f"Arret {nid}",
                    "stop_lat": node["lat"],
                    "stop_lon": node["lon"],
                }
            if not cleaned or cleaned[-1] != stop_id:
                cleaned.append(stop_id)

        if len(cleaned) < 2:
            skipped.append((rel["id"], f"ref={ref}: unresolved stops in OSM"))
            continue

        cumulative_s = [0.0]
        for a, b in zip(cleaned[:-1], cleaned[1:]):
            sa, sb = stops_by_id[a], stops_by_id[b]
            dist = haversine_m(sa["stop_lat"], sa["stop_lon"], sb["stop_lat"], sb["stop_lon"])
            travel_s = dist / speed_m_s
            cumulative_s.append(cumulative_s[-1] + travel_s + schedule["dwellSeconds"])

        shape_points = build_shape_points(way_refs, ways_meta, nodes)
        shape_id = ""
        if len(shape_points) >= 2:
            shape_id = f"SHAPE_{rel['id']}"
            for seq, (lat, lon) in enumerate(shape_points, start=1):
                shapes_rows.append(
                    {
                        "shape_id": shape_id,
                        "shape_pt_lat": lat,
                        "shape_pt_lon": lon,
                        "shape_pt_sequence": seq,
                    }
                )
            relations_with_shape += 1
        else:
            relations_without_shape += 1

        direction_id = direction_counter.get(route_id, 0) % 2
        direction_counter[route_id] = direction_counter.get(route_id, 0) + 1

        # One trip per relation, not one per departure: this is a
        # frequency-based trip (frequencies.txt below), not a literal
        # timetable. Its stop_times are relative to trip start (0 =
        # "00:00:00"), not real times of day - GTFS replays this same
        # pattern at whatever time-of-day each frequency window says.
        # Baking in a real departure per headway slot (the old approach)
        # implied a false precision the schedule doesn't have - an operator
        # without published timetables gives "about every 20 minutes", not
        # "the 06:20 leaves at 06:20".
        trip_id = f"{route_id}_{rel['id']}"
        trips_rows.append(
            {
                "route_id": route_id,
                "service_id": "DAILY",
                "trip_id": trip_id,
                "trip_headsign": tags.get("to", ""),
                "direction_id": direction_id,
                "shape_id": shape_id,
            }
        )
        for seq, stop_id in enumerate(cleaned, start=1):
            t = seconds_to_gtfs_time(cumulative_s[seq - 1])
            stop_times_rows.append(
                {
                    "trip_id": trip_id,
                    "arrival_time": t,
                    "departure_time": t,
                    "stop_id": stop_id,
                    "stop_sequence": seq,
                    "pickup_type": 0,
                    "drop_off_type": 0,
                }
            )
        for period in schedule["frequencyPeriods"]:
            frequencies_rows.append(
                {
                    "trip_id": trip_id,
                    "start_time": period["start"],
                    "end_time": period["end"],
                    "headway_secs": period["headwaySeconds"],
                    # Explicit even though 0 is the GTFS default: these
                    # are approximate headways, not an exact timetable -
                    # OTP must not assume strict schedule adherence.
                    "exact_times": 0,
                }
            )

    # Every declared agency gets a row (even one with zero routes today -
    # GTFS allows it, and it keeps agency.txt driven by the registry, not
    # by what this particular OSM snapshot happened to contain). The
    # fallback agency only gets a row if it was actually used, so a
    # clean run with every relation correctly attributed never carries
    # a dangling "unknown operator" entry.
    agency_rows = [
        {
            "agency_id": a["agencyId"],
            "agency_name": a["agencyName"],
            "agency_url": a["agencyUrl"],
            "agency_timezone": a["agencyTimezone"],
            "agency_lang": a["agencyLang"],
        }
        for a in city["agencies"]
    ]
    declared_ids = {a["agencyId"] for a in city["agencies"]}
    default_id = city["defaultAgencyId"]
    if default_id not in declared_ids and default_id in routes_per_agency:
        primary = city["agencies"][0]
        agency_rows.append(
            {
                "agency_id": default_id,
                "agency_name": "Operador desconocido",
                "agency_url": primary["agencyUrl"],
                "agency_timezone": primary["agencyTimezone"],
                "agency_lang": primary["agencyLang"],
            }
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    write_csv(
        output_dir / "agency.txt",
        ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
        agency_rows,
    )
    write_csv(
        output_dir / "stops.txt",
        ["stop_id", "stop_name", "stop_lat", "stop_lon"],
        list(stops_by_id.values()),
    )
    write_csv(
        output_dir / "routes.txt",
        ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"],
        list(routes_by_id.values()),
    )
    write_csv(
        output_dir / "calendar.txt",
        [
            "service_id", "monday", "tuesday", "wednesday", "thursday",
            "friday", "saturday", "sunday", "start_date", "end_date",
        ],
        calendar_rows,
    )
    write_csv(
        output_dir / "trips.txt",
        ["route_id", "service_id", "trip_id", "trip_headsign", "direction_id", "shape_id"],
        trips_rows,
    )
    write_csv(
        output_dir / "stop_times.txt",
        ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence", "pickup_type", "drop_off_type"],
        stop_times_rows,
    )
    write_csv(
        output_dir / "shapes.txt",
        ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
        shapes_rows,
    )
    write_csv(
        output_dir / "frequencies.txt",
        ["trip_id", "start_time", "end_time", "headway_secs", "exact_times"],
        frequencies_rows,
    )

    zip_path.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in [
            "agency.txt", "stops.txt", "routes.txt", "calendar.txt",
            "trips.txt", "stop_times.txt", "shapes.txt", "frequencies.txt",
        ]:
            zf.write(output_dir / name, arcname=name)

    print()
    print(f"Routes generated: {len(routes_by_id)}")
    for agency_id, count in sorted(routes_per_agency.items(), key=lambda x: -x[1]):
        flag = " <-- check operator tag in OSM" if agency_id == city["defaultAgencyId"] else ""
        print(f"  - {agency_id}: {count}{flag}")
    print(f"Unique stops: {len(stops_by_id)}")
    print(f"Trips generated: {len(trips_rows)} (1 per relation, frequency-based)")
    print(f"Stop_times generated: {len(stop_times_rows)}")
    print(f"Frequencies generated: {len(frequencies_rows)} ({len(schedule['frequencyPeriods'])} bands x {len(trips_rows)} trips)")
    print(f"Relations with shape: {relations_with_shape}, without shape: {relations_without_shape}")
    print(f"Shape points generated: {len(shapes_rows)}")
    print(f"GTFS sin comprimir en: {output_dir}")
    print(f"Zip listo en: {zip_path}")
    if skipped:
        print(f"\n{len(skipped)} relations discarded:")
        for rid, reason in skipped:
            print(f"  - relation {rid}: {reason}")


if __name__ == "__main__":
    main()
