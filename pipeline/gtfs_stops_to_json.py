#!/usr/bin/env python3
"""Converts <city>-gtfs/stops.txt into a static JSON for the frontend.

Stops don't change with the synthetic schedule's frequency, so showing
them on Home's map doesn't need to query OTP live every time - a static
JSON (same pattern as pipeline/osm_to_pois.py) is instant, works offline,
and adds no load to the OTP server for this. OTP is still needed for the
Stop View (real schedules/frequency) and for the destination search by name.
"""
import csv
import json

from cities import frontend_public_data_dir, gtfs_dir, parse_city_arg

# OTP prepends the feed id (see otp/build-config.json, transitFeeds) to
# the GTFS stop_id to form the real gtfsId (confirmed live:
# "ouagadougou:OSM3387645735") - without this, navigating to the Stop
# View with an id from this JSON would fail (stop(id) returns null).


def main():
    city = parse_city_arg(__doc__)
    feed_id_prefix = f"{city['feedId']}:"
    stops_txt = gtfs_dir(city["slug"]) / "stops.txt"
    output_path = frontend_public_data_dir(city["slug"]) / "stops.json"

    stops = []
    with open(stops_txt, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            stops.append(
                {
                    "id": f"{feed_id_prefix}{row['stop_id']}",
                    "name": row["stop_name"],
                    "lat": float(row["stop_lat"]),
                    "lon": float(row["stop_lon"]),
                }
            )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(stops, f, ensure_ascii=False, indent=2)

    print(f"{len(stops)} stops written to {output_path}")


if __name__ == "__main__":
    main()
