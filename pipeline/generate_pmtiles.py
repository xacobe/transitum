#!/usr/bin/env python3
"""Generate per-city PMTiles vector tile files from a country-level OSM PBF.

Usage:
    python pipeline/generate_pmtiles.py ouagadougou    # one city
    python pipeline/generate_pmtiles.py                # all cities

Output: data/cities/<slug>/tiles.pmtiles

The OSM PBF for each city's country is read from data/.cache/<country>-latest.osm.pbf.
If the file is missing and the country has a 'geofabrikUrl' in
config/cities/_countries.json, it is downloaded automatically. Otherwise an
error is printed with instructions.

Requires one of:
  - Java 17+ on PATH  (check: java -version)
  - OR Docker on PATH (use --docker flag, no Java needed)

Planetiler is downloaded automatically to pipeline/tools/ on first run
(~150 MB one-time download). Subsequent runs reuse the cached JAR.

First run also downloads Natural Earth shapefiles (~2 MB) used for
land/ocean at low zoom levels — requires internet access.
Subsequent runs work fully offline.

Zoom range: 0–15. Tiles at zoom 0–10 are tiny (a few KB total per city);
the bulk of the file is zoom 11–15. MapLibre is configured to only
request tiles at zoom 11–15, so lower zooms are never used in the app
but add negligible size to the file.
"""

import argparse
import sys
import time
import urllib.request
from pathlib import Path

from cities import CITIES, COUNTRIES

REPO_ROOT = Path(__file__).parent.parent
TOOLS_DIR  = Path(__file__).parent / "tools"
CITY_DATA  = REPO_ROOT / "data" / "cities"
CACHE_DIR  = REPO_ROOT / "data" / ".cache"

# Pin to a specific version for reproducible builds.
# Check https://github.com/onthegomap/planetiler/releases for newer versions.
PLANETILER_VERSION    = "0.8.3"
PLANETILER_DOCKER_IMG = "ghcr.io/onthegomap/planetiler:latest"
PLANETILER_JAR        = TOOLS_DIR / f"planetiler-{PLANETILER_VERSION}.jar"
PLANETILER_URL        = (
    f"https://github.com/onthegomap/planetiler/releases/download/"
    f"v{PLANETILER_VERSION}/planetiler.jar"
)


DOWNLOAD_TIMEOUT = 30   # seconds of silence before treating the connection as stalled
DOWNLOAD_RETRIES = 5
CHUNK_SIZE       = 1 << 16  # 64 KB


def _download(url: str, dest: Path, label: str) -> None:
    """Download url to dest with a progress indicator.

    Resumes from a partial .tmp file via HTTP Range when the server supports
    it, and retries on stalled/dropped connections. urlretrieve (the stdlib
    one-liner this used to use) sets no read timeout, so a connection that
    goes silent mid-transfer - hit for real on a ~1.4GB Geofabrik download,
    stuck at the same byte count for 20+ minutes - hangs forever instead of
    failing somewhere retryable.
    """
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    dest.parent.mkdir(parents=True, exist_ok=True)

    last_error: Exception | None = None
    for attempt in range(1, DOWNLOAD_RETRIES + 1):
        resume_from = tmp.stat().st_size if tmp.exists() else 0
        headers = {"User-Agent": "transitum/1.0"}
        if resume_from:
            headers["Range"] = f"bytes={resume_from}-"

        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as resp:  # noqa: S310
                resuming = resp.status == 206
                if resume_from and not resuming:
                    resume_from = 0  # server ignored Range - restart clean below
                total = resume_from + int(resp.headers.get("Content-Length") or 0)
                with open(tmp, "ab" if resuming else "wb") as f:
                    done = resume_from
                    while chunk := resp.read(CHUNK_SIZE):
                        f.write(chunk)
                        done += len(chunk)
                        if total:
                            pct = min(100, done * 100 // total)
                            print(f"\r  {pct}%  ({done / 1e6:.0f} / {total / 1e6:.0f} MB)", end="", flush=True)
            if total and tmp.stat().st_size < total:
                raise ConnectionError(f"connection closed early ({tmp.stat().st_size} of {total} bytes)")
            tmp.rename(dest)
            print(f"\r  done  ({dest.stat().st_size / 1e6:.0f} MB)                    ")
            return
        except Exception as exc:  # noqa: BLE001 - any transient failure here should retry, not just timeouts
            last_error = exc
            wait = min(2 ** attempt, 30)
            print(f"\r  attempt {attempt}/{DOWNLOAD_RETRIES} failed ({exc}) - retrying in {wait}s...                    ")
            time.sleep(wait)

    tmp.unlink(missing_ok=True)
    raise SystemExit(f"{label} download failed after {DOWNLOAD_RETRIES} attempts: {last_error}")


def ensure_planetiler() -> None:
    if PLANETILER_JAR.exists():
        return
    print(f"Downloading Planetiler {PLANETILER_VERSION} (~150 MB)...")
    print(f"  from {PLANETILER_URL}")
    _download(PLANETILER_URL, PLANETILER_JAR, "Planetiler")


def ensure_osm_pbf(pbf_path: Path, geofabrik_url: str | None, country_slug: str) -> None:
    if pbf_path.exists():
        return
    if not geofabrik_url:
        raise SystemExit(
            f"OSM PBF not found: {pbf_path}\n"
            f"Add 'geofabrikUrl' to countries.{country_slug} in config/cities/_countries.json,\n"
            "or download it manually from https://download.geofabrik.de"
        )
    print(f"Downloading OSM extract for '{country_slug}'...")
    print(f"  from {geofabrik_url}")
    _download(geofabrik_url, pbf_path, f"OSM PBF ({country_slug})")


def generate(city: dict, pbf_path: Path) -> bool:
    import subprocess
    slug    = city["slug"]
    bbox    = city["tileBbox"]
    minzoom = city.get("tileMinzoom", 11)
    output  = CITY_DATA / slug / "tiles.pmtiles"
    output.parent.mkdir(parents=True, exist_ok=True)

    bounds = f"{bbox['minLon']},{bbox['minLat']},{bbox['maxLon']},{bbox['maxLat']}"
    cmd = [
        "java", "-Xmx4g", "-jar", str(PLANETILER_JAR),
        f"--osm-path={pbf_path}",
        f"--output={output}",
        f"--bounds={bounds}",
        f"--minzoom={minzoom}",
        "--maxzoom=15",
        f"--tmp-dir={REPO_ROOT / 'data' / 'tmp'}",
        f"--download-dir={TOOLS_DIR / 'planetiler-sources'}",
        "--download",
        "--fetch_wikidata=false",
        "--exclude-layers=building",
    ]

    print(f"\n[{slug}] generating tiles  bounds={bounds}")
    print(f"  output → {output}")
    result = subprocess.run(cmd, check=False)

    if result.returncode != 0:
        print(f"[{slug}] Planetiler failed (exit {result.returncode})", file=sys.stderr)
        return False

    size_mb = output.stat().st_size / 1e6
    print(f"[{slug}] done  {size_mb:.1f} MB → {output.name}")
    return True


def generate_docker(city: dict, pbf_path: Path) -> bool:
    import subprocess
    slug    = city["slug"]
    bbox    = city["tileBbox"]
    minzoom = city.get("tileMinzoom", 11)
    output  = CITY_DATA / slug / "tiles.pmtiles"
    output.parent.mkdir(parents=True, exist_ok=True)

    bounds      = f"{bbox['minLon']},{bbox['minLat']},{bbox['maxLon']},{bbox['maxLat']}"
    sources_dir = TOOLS_DIR / "planetiler-sources"
    sources_dir.mkdir(parents=True, exist_ok=True)

    # Container paths — /data is mounted to the repo root.
    pbf_container = f"/data/data/.cache/{pbf_path.name}"
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{REPO_ROOT}:/data",
        "-v", f"{sources_dir}:/sources",
        PLANETILER_DOCKER_IMG,
        f"--osm-path={pbf_container}",
        f"--output=/data/data/cities/{slug}/tiles.pmtiles",
        f"--bounds={bounds}",
        f"--minzoom={minzoom}",
        "--maxzoom=16",
        f"--tmp-dir=/data/data/tmp",
        "--download-dir=/sources",
        "--download",
        "--force",
        # Buildings add 34% to the file size with no value for a transit app.
        # POIs (~11%) are kept: markets, hospitals, landmarks help users
        # orient themselves when locating stops on the map.
        "--exclude-layers=building",
    ]

    print(f"\n[{slug}] generating tiles via Docker  bounds={bounds}")
    result = subprocess.run(cmd, check=False)

    if result.returncode != 0:
        print(f"[{slug}] Planetiler (Docker) failed (exit {result.returncode})", file=sys.stderr)
        return False

    size_mb = output.stat().st_size / 1e6
    print(f"[{slug}] done  {size_mb:.1f} MB → {output.name}")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[1].strip())
    parser.add_argument("city", nargs="?", help="city slug (omit for all cities)")
    parser.add_argument(
        "--docker", action="store_true",
        help="run via Docker instead of local Java (no Java install required)",
    )
    args = parser.parse_args()

    if args.city:
        if args.city not in CITIES:
            sys.exit(f"Unknown city slug: {args.city!r}")
        cities = [CITIES[args.city]]
    else:
        cities = list(CITIES.values())

    cities = [c for c in cities if "tileBbox" in c]
    if not cities:
        sys.exit("No cities with tileBbox found in config/cities/")

    runner = generate_docker if args.docker else None
    if runner is None:
        ensure_planetiler()
        runner = generate

    # Ensure each country's PBF once (multiple cities may share the same file).
    seen_countries: set[str] = set()
    ok = True
    for city in cities:
        country_slug  = city["country"]
        pbf_path      = CACHE_DIR / f"{country_slug}-latest.osm.pbf"
        geofabrik_url = COUNTRIES.get(country_slug, {}).get("geofabrikUrl")

        if country_slug not in seen_countries:
            ensure_osm_pbf(pbf_path, geofabrik_url, country_slug)
            seen_countries.add(country_slug)

        if not runner(city, pbf_path):
            ok = False

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
