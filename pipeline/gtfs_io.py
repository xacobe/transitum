"""Shared GTFS file-list constant and CSV read/write helpers, used by both
import_gtfs.py (single official feed) and import_gtfs_multi.py (several
official feeds combined into one city, see its own docstring).
"""
import csv

# Every GTFS text file either import script might touch. Order matters for
# import_gtfs.py's re-zip step (cosmetic - GTFS readers don't care), not for
# reading.
GTFS_FILES = [
    "agency.txt", "stops.txt", "routes.txt", "trips.txt", "stop_times.txt",
    "calendar.txt", "calendar_dates.txt", "shapes.txt", "fare_attributes.txt",
    "fare_rules.txt", "frequencies.txt", "transfers.txt", "feed_info.txt",
]


def read_csv_rows(path) -> list[dict]:
    """Reads a GTFS text file into a list of dicts, or [] if it doesn't
    exist - most GTFS files besides agency/stops/routes/trips/stop_times
    are optional, and treating a missing one as "no rows" instead of
    raising lets every filter/merge step stay unconditional."""
    if not path.exists():
        return []
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_csv_rows(path, rows: list[dict]) -> None:
    """Writes rows back out, or removes any existing file at `path` if
    there are none - an empty CSV with just a header would otherwise look
    like "this GTFS file exists but is empty" to downstream readers,
    instead of "this optional file doesn't apply here"."""
    if not rows:
        path.unlink(missing_ok=True)
        return
    # Column set can vary row-to-row (optional GTFS columns some sources
    # set and others omit) - union them, keeping first-seen order, so no
    # column silently gets dropped for the rows that do have it.
    fieldnames: list[str] = []
    seen = set()
    for row in rows:
        for key in row:
            if key not in seen:
                seen.add(key)
                fieldnames.append(key)
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, restval="")
        writer.writeheader()
        writer.writerows(rows)
