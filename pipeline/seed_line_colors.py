#!/usr/bin/env python3
"""Seeds config/line-colors.json with a starting color for each of a city's
lines, so a deployment can hand-edit specific ones instead of writing the
whole file from scratch.

Only fills in lines that don't already have an entry - never touches or
removes an existing one, so re-running after hand-edits (or after the
GTFS/OSM data changes and adds a new line) only ever adds what's missing.

Each line's seed value is whatever color it shows today: the official GTFS
route_color if the feed has one, otherwise the same deterministic hash-based
palette color the frontend falls back to
(frontend/src/composables/useLineColor.ts's LINE_PALETTE/hashString - kept
in exact sync here, see _hash_string below) - so the seeded file starts as
a faithful snapshot of what's on screen, ready to edit.

Usage:
    make line-colors CITY=vigo
    python3 pipeline/seed_line_colors.py --city vigo
"""
import json

from cities import ROOT, city_data_dir, parse_city_arg

LINE_COLORS_PATH = ROOT / "config" / "line-colors.json"

# Mirrors useLineColor.ts's LINE_PALETTE exactly - light-mode bg only (this
# file's colors are theme-invariant, same as official GTFS colors; every
# light-mode text color in that palette is '#fff', so it's not repeated
# here). A deployment that cares about dark-mode contrast for a specific
# line can hand-edit that entry after seeding.
LINE_PALETTE = [
    "#0a8a5a", "#d2641a", "#2563b6", "#7c3aed",
    "#c2410c", "#0e7490", "#a16207", "#be185d",
    "#4d7c0f", "#5b21b6", "#0369a1", "#b45309",
]


def _srgb_to_linear(c: int) -> float:
    s = c / 255
    return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4


def _relative_luminance(hex_color: str) -> float:
    hex_color = hex_color.lstrip("#")
    r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
    return 0.2126 * _srgb_to_linear(r) + 0.7152 * _srgb_to_linear(g) + 0.0722 * _srgb_to_linear(b)


# Black is only used once it clears this ratio - see color.ts's identical
# constant for why 6 (comfortably between WCAG AA's 4.5 and AAA's 7) instead
# of just "whichever ratio wins".
_BLACK_MIN_CONTRAST = 6


def contrasting_text_color(bg_hex: str) -> str:
    """WCAG relative luminance - exact port of frontend/src/services/color.ts's
    contrastingTextColor(), verified to produce identical output. Real GTFS
    feeds' route_text_color can't be trusted for contrast (Vitrasa's is
    "000000" for every line regardless of how dark route_color is), so this
    is used instead of the feed's declared value for both official-color and
    hash-fallback seeds.
    """
    luminance = _relative_luminance(bg_hex)
    contrast_with_black = (luminance + 0.05) / 0.05
    return "#000000" if contrast_with_black >= _BLACK_MIN_CONTRAST else "#ffffff"


def _hash_string(s: str) -> int:
    """Exact port of useLineColor.ts's hashString(): JS's `h = (h*31+c)|0`
    truncates to a 32-bit signed int after every character, but modular
    arithmetic makes truncating once at the end equivalent - verified
    against the real frontend function for a range of inputs, including
    non-ASCII, before relying on this here.
    """
    h = 0
    for ch in s:
        h = h * 31 + ord(ch)
    h &= 0xFFFFFFFF
    if h >= 0x80000000:
        h -= 0x100000000
    return abs(h)


def seed_color_for(short_name: str, agency_id: str | None, has_multiple_agencies: bool) -> str:
    # Matches useLineColor.ts's colorFor(): agencyId only enters the hash
    # once a city actually has more than one agency.
    key = f"{agency_id or ''}::{short_name}" if has_multiple_agencies else short_name
    return LINE_PALETTE[_hash_string(key.upper()) % len(LINE_PALETTE)]


def main() -> None:
    city = parse_city_arg(__doc__)
    routes_path = city_data_dir(city["slug"]) / "routes.json"
    if not routes_path.exists():
        raise SystemExit(
            f"{routes_path} not found - generate this city's data first "
            "(make data / make import-gtfs / make use-example)."
        )
    routes = json.loads(routes_path.read_text(encoding="utf-8"))
    has_multiple_agencies = len(city["agencies"]) > 1

    registry = json.loads(LINE_COLORS_PATH.read_text(encoding="utf-8")) if LINE_COLORS_PATH.exists() else {}
    city_colors = registry.setdefault(city["slug"], {})

    added = 0
    for route in routes:
        short_name = route["shortName"]
        if short_name in city_colors:
            continue
        if route.get("color"):
            # Not route.get("textColor") - see contrasting_text_color's
            # docstring for why a feed's declared value isn't trustworthy.
            bg, text = route["color"], contrasting_text_color(route["color"])
        else:
            # LINE_PALETTE's light-mode text is '#fff' for every entry
            # (see seed_color_for/LINE_PALETTE above) - matched literally
            # here, not recomputed via contrasting_text_color(), since two
            # of the 12 palette colors (#0a8a5a, #d2641a) actually contrast
            # better with black by WCAG's own math. That's a separate,
            # pre-existing question about the palette itself, not something
            # this seed should silently "fix" and end up disagreeing with
            # what the frontend currently shows for an unseeded line.
            bg = seed_color_for(short_name, route.get("agencyId"), has_multiple_agencies)
            text = "#ffffff"
        city_colors[short_name] = {"bg": bg, "text": text}
        added += 1

    if not city_colors:
        registry.pop(city["slug"], None)

    LINE_COLORS_PATH.write_text(json.dumps(registry, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    skipped = len(routes) - added
    print(
        f"{city['slug']}: seeded {added} new line color(s) "
        f"(skipped {skipped} already present) → {LINE_COLORS_PATH.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    main()
