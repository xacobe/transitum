#!/usr/bin/env bash
# Regenerates the app icon (favicon, in-app logo, PWA icons) from
# config/.env's VITE_THEME_COLOR - run this after changing that value so a
# full rebrand is "edit .env, run this script," no manual SVG/PNG editing.
#
# Requires rsvg-convert (librsvg) to rasterize the PWA PNG icons:
#   macOS:  brew install librsvg
#   Debian: apt-get install librsvg2-bin
#
# Usage: frontend/scripts/generate-icons.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/config/.env"
LOGO_DIR="$ROOT/frontend/public/logo"
ICONS_DIR="$ROOT/frontend/public/icons"

if ! command -v rsvg-convert >/dev/null; then
  echo "rsvg-convert not found - install librsvg (see script header) and re-run." >&2
  exit 1
fi

THEME_COLOR=$(grep '^VITE_THEME_COLOR=' "$ENV_FILE" | cut -d'=' -f2)
if [ -z "$THEME_COLOR" ]; then
  echo "VITE_THEME_COLOR not set in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$LOGO_DIR" "$ICONS_DIR"

# Generic map-pin mark, no city/country-specific imagery - a solid fill in
# the deployment's theme color with a plain white dot. Used as-is for both
# light and dark UI (the solid fill plus white dot reads fine on either).
cat > "$LOGO_DIR/icon.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="100" height="120">
  <path d="M50,8 C28,8 12,24 12,46 C12,76 50,112 50,112 C50,112 88,76 88,46 C88,24 72,8 50,8Z" fill="$THEME_COLOR"/>
  <circle cx="50" cy="46" r="14" fill="#ffffff"/>
</svg>
EOF

# Mono-ink variant (solid silhouette, dot knocked out) - referenced from
# the styleguide as a print/single-color usage example.
cat > "$LOGO_DIR/icon-mono.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" width="100" height="120">
  <defs><mask id="m"><rect x="0" y="0" width="100" height="120" fill="#fff"/><circle cx="50" cy="46" r="14" fill="#000"/></mask></defs>
  <path d="M50,8 C28,8 12,24 12,46 C12,76 50,112 50,112 C50,112 88,76 88,46 C88,24 72,8 50,8Z" fill="$THEME_COLOR" mask="url(#m)"/>
</svg>
EOF

# Square version for PWA PNG rasterization - the pin's own 100x120 bbox
# (roughly x:12-88, y:8-112) pre-scaled and translated so it lands centered
# with even margin in a 100x100 canvas. rsvg-convert renders a fixed source
# to a target size, it doesn't composite/pad - baking the padding into the
# source viewBox is what actually produces a square icon with a safe zone,
# rather than a stretched or off-center one.
SQUARE_SVG="$LOGO_DIR/.icon-square-tmp.svg"
cat > "$SQUARE_SVG" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect x="0" y="0" width="100" height="100" fill="#ffffff"/>
  <g transform="translate(13.46,6.15) scale(0.7308)">
    <path d="M50,8 C28,8 12,24 12,46 C12,76 50,112 50,112 C50,112 88,76 88,46 C88,24 72,8 50,8Z" fill="$THEME_COLOR"/>
    <circle cx="50" cy="46" r="14" fill="#ffffff"/>
  </g>
</svg>
EOF

render_png() {
  rsvg-convert -w "$1" -h "$1" "$SQUARE_SVG" -o "$2"
}
render_png 192 "$ICONS_DIR/icon-192.png"
render_png 512 "$ICONS_DIR/icon-512.png"
render_png 512 "$ICONS_DIR/icon-maskable-512.png"
rm "$SQUARE_SVG"

echo "Icons regenerated from VITE_THEME_COLOR=$THEME_COLOR"
