"""Shared GTFS file-list constant and CSV read/write helpers, used by both
import_gtfs.py (single official feed) and import_gtfs_multi.py (several
official feeds combined into one city, see its own docstring).
"""
import csv
import zipfile
from pathlib import Path

# Every GTFS text file either import script might touch. Order matters for
# import_gtfs.py's re-zip step (cosmetic - GTFS readers don't care), not for
# reading.
GTFS_FILES = [
    "agency.txt", "stops.txt", "routes.txt", "trips.txt", "stop_times.txt",
    "calendar.txt", "calendar_dates.txt", "shapes.txt", "fare_attributes.txt",
    "fare_rules.txt", "frequencies.txt", "transfers.txt", "feed_info.txt",
]


def safe_extract_zip(zf: zipfile.ZipFile, dest) -> None:
    """Extracts every member of `zf` into `dest`, rejecting any entry whose
    resolved path would land outside `dest` (a "Zip Slip" path-traversal
    archive using ../ segments or an absolute path). GTFS zips are fetched
    from remote, operator-controlled URLs, so a malicious or malformed feed
    must not be able to write arbitrary files on the machine running the
    pipeline. Use this instead of ZipFile.extractall() anywhere the archive
    isn't produced by this pipeline itself."""
    dest_root = Path(dest).resolve()
    for member in zf.namelist():
        target = (dest_root / member).resolve()
        if target != dest_root and dest_root not in target.parents:
            raise ValueError(
                f"Refusing to extract unsafe zip entry outside the destination: {member!r}"
            )
    zf.extractall(dest_root)


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


def write_gtfs_zip(zip_path, out_dir) -> None:
    """Zips whichever GTFS_FILES exist in `out_dir` into `zip_path`
    (creating its parent dir), producing the data/.cache/<slug>.gtfs.zip
    that generate-transit-data consumes so it matches what's on disk in
    gtfs_dir(). File order follows GTFS_FILES (cosmetic - GTFS readers
    don't care)."""
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in GTFS_FILES:
            p = out_dir / name
            if p.exists():
                zf.write(p, name)
