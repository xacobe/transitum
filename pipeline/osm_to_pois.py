#!/usr/bin/env python3
"""Generates the POI dataset for a city from OpenStreetMap via Overpass.

Produces a single data/cities/<city>/pois.json containing all named
POIs, each with a `tier` field (1–3) that reflects rough importance:

  tier 1  Essential — hospitals, markets, universities, neighbourhoods
  tier 2  Common    — banks, pharmacies, schools, hotels, fuel, …
  tier 3  Full      — shops, restaurants, offices, leisure, worship, …

The tier field is available for relevance ranking in the search index but
the file is loaded as a single unit (one HTTP request, tens to low hundreds
of KB gzipped for a typical city). Splitting into multiple files only pays
off for cities with tens of thousands of POIs.
"""
import json
from collections import Counter

from cities import frontend_public_data_dir, parse_city_arg
from overpass import area_filter, overpass_query

# ── Tier definitions ──────────────────────────────────────────────────────────
# Maps OSM tag value → display type string used for icon selection in the UI.
# A POI is assigned the LOWEST tier number that matches any of its tags.

T1_AMENITY: dict[str, str] = {
    "hospital":     "hospital",
    "clinic":       "clinic",
    "marketplace":  "marketplace",
    "university":   "university",
    "college":      "university",
    "bus_station":  "transit",
}

T1_PLACE: dict[str, str] = {
    "city":         "neighbourhood",
    "town":         "neighbourhood",
    "village":      "neighbourhood",
    "suburb":       "neighbourhood",
    "neighbourhood":"neighbourhood",
    "quarter":      "neighbourhood",
    "district":     "neighbourhood",
    "borough":      "neighbourhood",
    "city_block":   "neighbourhood",
}

T2_AMENITY: dict[str, str] = {
    "bank":             "bank",
    "atm":              "bank",
    "pharmacy":         "pharmacy",
    "school":           "school",
    "secondary_school": "school",
    "kindergarten":     "school",
    "fuel":             "fuel",
    "police":           "police",
    "fire_station":     "fire_station",
    "post_office":      "post_office",
    "library":          "library",
    "cinema":           "cinema",
    "theatre":          "theatre",
    "stadium":          "stadium",
    "swimming_pool":    "leisure",
    "social_facility":  "social",
    "community_centre": "social",
}

T2_TOURISM: dict[str, str] = {
    "hotel":        "hotel",
    "guest_house":  "hotel",
    "hostel":       "hotel",
    "motel":        "hotel",
    "museum":       "museum",
    "attraction":   "attraction",
    "monument":     "attraction",
    "memorial":     "attraction",
    "viewpoint":    "attraction",
}

T2_LEISURE: dict[str, str] = {
    "park":         "park",
    "garden":       "park",
    "sports_centre":"leisure",
    "stadium":      "stadium",
    "pitch":        "leisure",
    "golf_course":  "leisure",
}

T2_HISTORIC: dict[str, str] = {
    "memorial":              "attraction",
    "monument":              "attraction",
    "tomb":                  "attraction",
    "ruins":                 "attraction",
    "castle":                "attraction",
    "fort":                  "attraction",
    "archaeological_site":   "attraction",
}

# healthcare=* is a parallel tagging scheme to amenity=* for medical facilities.
# Elements may carry both keys; Overpass deduplicates by ID so no double-counting.
T1_HEALTHCARE: dict[str, str] = {
    "hospital":     "hospital",
}

T2_HEALTHCARE: dict[str, str] = {
    "clinic":           "clinic",
    "pharmacy":         "pharmacy",
    "doctor":           "health",
    "dentist":          "health",
    "physiotherapist":  "health",
    "laboratory":       "health",
    "nursing_home":     "health",
    "rehabilitation":   "health",
    "blood_bank":       "health",
    "birthing_centre":  "health",
    "optometrist":      "health",
    "dialysis":         "health",
}

# T3 catch-all: amenity values not matched by T1/T2
T3_AMENITY: dict[str, str] = {
    "restaurant":        "food",
    "cafe":              "food",
    "bar":               "food",
    "fast_food":         "food",
    "pub":               "food",
    "food_court":        "food",
    "ice_cream":         "food",
    "dentist":           "health",
    "veterinary":        "health",
    "place_of_worship":  "worship",
    "car_wash":          "service",
    "vehicle_inspection":"service",
    "laundry":           "service",
    "supermarket":       "shop",
    "shelter":           "service",
}
# For T3: any element with shop=*, office=*, or unmatched tourism=/leisure= tag


def assign_tier_and_type(tags: dict) -> tuple[int, str] | None:
    """Return (tier 1-3, display_type) for an OSM element, or None to skip."""
    amenity    = tags.get("amenity")
    place      = tags.get("place")
    tourism    = tags.get("tourism")
    leisure    = tags.get("leisure")
    historic   = tags.get("historic")
    healthcare = tags.get("healthcare")
    government = tags.get("government")

    # T1
    if amenity and amenity in T1_AMENITY:
        return 1, T1_AMENITY[amenity]
    if place and place in T1_PLACE:
        return 1, T1_PLACE[place]
    if healthcare and healthcare in T1_HEALTHCARE:
        return 1, T1_HEALTHCARE[healthcare]

    # T2
    if amenity and amenity in T2_AMENITY:
        return 2, T2_AMENITY[amenity]
    if tourism and tourism in T2_TOURISM:
        return 2, T2_TOURISM[tourism]
    if leisure and leisure in T2_LEISURE:
        return 2, T2_LEISURE[leisure]
    if historic and historic in T2_HISTORIC:
        return 2, T2_HISTORIC[historic]
    if healthcare and healthcare in T2_HEALTHCARE:
        return 2, T2_HEALTHCARE[healthcare]
    if government:
        return 2, "office"

    # T3
    if amenity and amenity in T3_AMENITY:
        return 3, T3_AMENITY[amenity]
    if "shop" in tags:
        return 3, "shop"
    if "office" in tags:
        return 3, "office"
    if tourism:
        return 3, "attraction"
    if leisure:
        return 3, "leisure"
    if healthcare:
        return 3, "health"

    return None


def build_query(area_name: str, bbox: dict | None = None, admin_level: str | None = None) -> str:
    """Single Overpass query that fetches all POI-relevant elements with a name."""
    # See overpass.py::area_filter and the matching comment in
    # osm_to_gtfs.py::fetch_route_relations - the global bbox intersects
    # every statement with the city's own searchBbox, which guards against
    # homonyms elsewhere in the world; area_filter() guards against a
    # same-country, same-name ambiguity within the bbox itself.
    bbox_clause = ""
    if bbox:
        bbox_clause = f"[bbox:{bbox['minLat']},{bbox['minLon']},{bbox['maxLat']},{bbox['maxLon']}]"
    return f"""
    [out:json][timeout:180]{bbox_clause};
    area{area_filter(area_name, admin_level)}->.a;
    (
      node["amenity"]["name"](area.a);
      way["amenity"]["name"](area.a);
      node["place"]["name"](area.a);
      node["shop"]["name"](area.a);
      way["shop"]["name"](area.a);
      node["office"]["name"](area.a);
      way["office"]["name"](area.a);
      node["tourism"]["name"](area.a);
      way["tourism"]["name"](area.a);
      node["leisure"]["name"](area.a);
      way["leisure"]["name"](area.a);
      node["historic"]["name"](area.a);
      way["historic"]["name"](area.a);
      node["healthcare"]["name"](area.a);
      way["healthcare"]["name"](area.a);
      node["government"]["name"](area.a);
      way["government"]["name"](area.a);
    );
    out center;
    """


def build_query_bbox(bbox: dict) -> str:
    b = f"{bbox['minLat']},{bbox['minLon']},{bbox['maxLat']},{bbox['maxLon']}"
    return f"""
    [out:json][timeout:180];
    (
      node["amenity"]["name"]({b});
      way["amenity"]["name"]({b});
      node["place"]["name"]({b});
      node["shop"]["name"]({b});
      way["shop"]["name"]({b});
      node["office"]["name"]({b});
      way["office"]["name"]({b});
      node["tourism"]["name"]({b});
      way["tourism"]["name"]({b});
      node["leisure"]["name"]({b});
      way["leisure"]["name"]({b});
      node["historic"]["name"]({b});
      way["historic"]["name"]({b});
      node["healthcare"]["name"]({b});
      way["healthcare"]["name"]({b});
      node["government"]["name"]({b});
      way["government"]["name"]({b});
    );
    out center;
    """


def main():
    city = parse_city_arg(__doc__)
    out_dir = frontend_public_data_dir(city["slug"])
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Downloading POIs from Overpass…")
    osm_cfg = city["osmPatches"]
    data = overpass_query(build_query(osm_cfg["areaName"], city.get("searchBbox"), osm_cfg.get("adminLevel")))
    elements = data["elements"]

    if not elements and city.get("searchBbox"):
        print("  0 results with area — retrying with bbox…")
        data = overpass_query(build_query_bbox(city["searchBbox"]))
        elements = data["elements"]

    print(f"  {len(elements)} raw elements fetched")

    pois = []
    skipped = 0

    for el in elements:
        tags = el.get("tags", {})
        result = assign_tier_and_type(tags)
        if result is None:
            skipped += 1
            continue

        tier, poi_type = result

        if el["type"] == "node":
            lat, lon = el["lat"], el["lon"]
        else:
            center = el.get("center")
            if not center:
                skipped += 1
                continue
            lat, lon = center["lat"], center["lon"]

        pois.append({
            "id":   f"{el['type']}/{el['id']}",
            "name": tags["name"],
            "type": poi_type,
            "tier": tier,
            "lat":  round(lat, 6),
            "lon":  round(lon, 6),
        })

    # Sort by tier so T1 results appear first in the search index
    pois.sort(key=lambda p: p["tier"])

    path = out_dir / "pois.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(pois, f, ensure_ascii=False, separators=(",", ":"))

    counts = Counter(p["type"] for p in pois)
    tier_counts = Counter(p["tier"] for p in pois)
    print(f"\n{len(pois)} POIs written → {path}")
    print(f"  T1: {tier_counts[1]}  T2: {tier_counts[2]}  T3: {tier_counts[3]}")
    print(f"  Skipped (no tier match or no geometry): {skipped}")
    print("\nBy type:")
    for poi_type, count in counts.most_common():
        print(f"  {count:5d}  {poi_type}")


if __name__ == "__main__":
    main()
