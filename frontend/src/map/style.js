/**
 * MapLibre GL style generator for our Planetiler/OpenMapTiles-schema PMTiles.
 *
 * Designed for a transit app where bus lines and stops are the main content:
 * - Roads show hierarchy but stay neutral/subtle
 * - Buildings excluded from tiles (--exclude-layers=building in generate_pmtiles.py)
 * - POI text labels at zoom 15+ (no icons — no sprite dependency)
 * - Glyphs from OpenFreeMap CDN; cached by browser after first load
 *   (bundling glyphs locally is a future step for fully-offline label rendering)
 *
 * Colors come from the --map-* custom properties in styles/tokens.css (light
 * and dark theme blocks), not literals here - a deployment re-themes the
 * basemap the same way it re-themes everything else (config/theme.css),
 * without touching this file. Read via getComputedStyle rather than passed
 * in, since MapLibre's GL paint properties need literal values up front (no
 * live var() the way DOM/CSS elements get) - called after the `data-theme`
 * attribute is already set, so this always reflects the active theme.
 */

const MAP_TOKEN_KEYS = [
  'bg', 'water', 'waterway', 'water-label', 'road-label', 'park',
  'landuse-commercial', 'landuse-industrial', 'landuse-school',
  'aeroway-fill', 'aeroway-runway', 'aeroway-label', 'park-label', 'boundary',
  'road-minor-case', 'road-minor-fill', 'road-secondary-case', 'road-secondary-fill',
  'road-primary-case', 'road-primary-fill', 'road-motorway-case', 'road-motorway-fill',
  'place-city', 'place-town', 'place-village', 'place-suburb', 'label-halo',
]

function readMapColors() {
  const style = getComputedStyle(document.documentElement)
  const c = {}
  for (const key of MAP_TOKEN_KEYS) {
    // road-label -> road_label, to match this file's existing object-key style
    c[key.replaceAll('-', '_')] = style.getPropertyValue(`--map-${key}`).trim()
  }
  return c
}

export function buildMapStyle(tilesUrl) {
  const c = readMapColors()

  return {
    version: 8,
    // OpenFreeMap CDN glyphs — Noto Sans (Regular + Bold) for Latin/Arabic/etc.
    // Loaded once, cached by the browser. Bundling locally is a future TODO.
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    // No sprite: we don't use icon symbols, only text labels for POIs.
    sources: {
      openmaptiles: {
        type: 'vector',
        url: tilesUrl,
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        minzoom: 0,
        maxzoom: 16,
      },
    },
    layers: [
      // ── Background ─────────────────────────────────────────────────────────
      { id: 'background', type: 'background',
        paint: { 'background-color': c.bg } },

      // ── Water ──────────────────────────────────────────────────────────────
      { id: 'water-fill', type: 'fill',
        source: 'openmaptiles', 'source-layer': 'water',
        paint: { 'fill-color': c.water } },

      { id: 'waterway-line', type: 'line',
        source: 'openmaptiles', 'source-layer': 'waterway',
        paint: { 'line-color': c.waterway, 'line-width': 1 } },

      // ── Green areas ────────────────────────────────────────────────────────
      { id: 'park-fill', type: 'fill',
        source: 'openmaptiles', 'source-layer': 'park',
        paint: { 'fill-color': c.park, 'fill-opacity': 0.8 } },

      { id: 'landuse-green', type: 'fill',
        source: 'openmaptiles', 'source-layer': 'landuse',
        filter: ['match', ['get', 'class'],
          ['park', 'grass', 'meadow', 'cemetery', 'recreation_ground'], true, false],
        paint: { 'fill-color': c.park, 'fill-opacity': 0.5 } },

      { id: 'landuse-commercial', type: 'fill',
        source: 'openmaptiles', 'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['commercial', 'retail'], true, false],
        paint: { 'fill-color': c.landuse_commercial, 'fill-opacity': 0.7 } },

      { id: 'landuse-industrial', type: 'fill',
        source: 'openmaptiles', 'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['industrial', 'quarry'], true, false],
        paint: { 'fill-color': c.landuse_industrial, 'fill-opacity': 0.6 } },

      { id: 'landuse-school', type: 'fill',
        source: 'openmaptiles', 'source-layer': 'landuse',
        filter: ['match', ['get', 'class'], ['school', 'university', 'hospital'], true, false],
        paint: { 'fill-color': c.landuse_school, 'fill-opacity': 0.6 } },

      // ── Airport ────────────────────────────────────────────────────────────
      { id: 'aeroway-fill', type: 'fill',
        source: 'openmaptiles', 'source-layer': 'aeroway',
        filter: ['==', ['get', 'class'], 'aerodrome'],
        paint: { 'fill-color': c.aeroway_fill, 'fill-opacity': 0.9 } },

      { id: 'aeroway-runway', type: 'line',
        source: 'openmaptiles', 'source-layer': 'aeroway',
        filter: ['match', ['get', 'class'], ['runway', 'taxiway'], true, false],
        paint: {
          'line-color': c.aeroway_runway,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 14, 6],
        } },

      // Label from the aeroway polygon (when Planetiler includes name there)
      { id: 'aeroway-label', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'aeroway',
        filter: ['all', ['==', ['get', 'class'], 'aerodrome'], ['has', 'name']],
        minzoom: 10,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Noto Sans Bold'],
        },
        paint: {
          'text-color': c.aeroway_label,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1.5,
        } },

      // Fallback: aerodrome point from the poi layer (always has name in OML)
      { id: 'aeroway-poi-label', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'poi',
        filter: ['all', ['has', 'name'],
          ['match', ['get', 'class'], ['aerodrome', 'airport', 'airfield'], true, false]],
        minzoom: 10,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Noto Sans Bold'],
        },
        paint: {
          'text-color': c.aeroway_label,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1.5,
        } },

      // ── Admin boundaries (arrondissements / communes) ──────────────────────
      { id: 'boundary-admin', type: 'line',
        source: 'openmaptiles', 'source-layer': 'boundary',
        filter: ['all',
          ['>=', ['get', 'admin_level'], 6],
          ['<=', ['get', 'admin_level'], 8],
        ],
        minzoom: 11,
        paint: {
          'line-color': c.boundary,
          'line-width': 1,
          'line-dasharray': [4, 3],
          'line-opacity': 0.6,
        } },

      // ── Roads — minor (zoom 13+) ───────────────────────────────────────────
      { id: 'road-minor-case', type: 'line',
        source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['minor', 'service', 'track', 'path'], true, false],
        minzoom: 13,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road_minor_case,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1, 14, 2.5, 16, 7],
        } },

      { id: 'road-minor-fill', type: 'line',
        source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['minor', 'service', 'track', 'path'], true, false],
        minzoom: 13,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road_minor_fill,
          'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 14, 1.5, 16, 5],
        } },

      // ── Roads — secondary / tertiary ───────────────────────────────────────
      { id: 'road-secondary-case', type: 'line',
        source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
        minzoom: 11,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road_secondary_case,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 16, 10],
        } },

      { id: 'road-secondary-fill', type: 'line',
        source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
        minzoom: 11,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road_secondary_fill,
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1, 16, 7.5],
        } },

      // ── Roads — primary / trunk ────────────────────────────────────────────
      { id: 'road-primary-case', type: 'line',
        source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false],
        minzoom: 8,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road_primary_case,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 11, 3, 16, 14],
        } },

      { id: 'road-primary-fill', type: 'line',
        source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['match', ['get', 'class'], ['primary', 'trunk'], true, false],
        minzoom: 8,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road_primary_fill,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 11, 2, 16, 11],
        } },

      // ── Roads — motorway ───────────────────────────────────────────────────
      { id: 'road-motorway-case', type: 'line',
        source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: {
          'line-color': c.road_motorway_case,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 4, 16, 16],
        } },

      { id: 'road-motorway-fill', type: 'line',
        source: 'openmaptiles', 'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': c.road_motorway_fill,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 11, 3, 16, 13],
        } },

      // ── Road labels ────────────────────────────────────────────────────────
      // ── Water labels ───────────────────────────────────────────────────────
      { id: 'water-label', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'water',
        filter: ['has', 'name'],
        minzoom: 9,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': ['Noto Sans Italic'],
        },
        paint: {
          'text-color': c.water_label,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1,
        } },

      { id: 'waterway-label', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'waterway',
        filter: ['has', 'name'],
        minzoom: 12,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-font': ['Noto Sans Regular'],
        },
        paint: {
          'text-color': c.water_label,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1,
        } },

      // ── Road labels ────────────────────────────────────────────────────────
      // Major arteries from zoom 12, minor streets from 14.
      // Muted colour + small size — roads are already drawn, labels are
      // just confirmation, not the main reading layer.
      { id: 'road-label-major', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'transportation_name',
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'], true, false],
        minzoom: 12,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-font': ['Noto Sans Regular'],
          'text-padding': 3,
        },
        paint: {
          'text-color': c.road_label,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1,
        } },

      { id: 'road-label-minor', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'transportation_name',
        filter: ['match', ['get', 'class'], ['minor', 'service'], true, false],
        minzoom: 15,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-size': 9,
          'text-font': ['Noto Sans Regular'],
          'text-padding': 2,
        },
        paint: {
          'text-color': c.road_label,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1,
        } },

      // ── Rail station labels ────────────────────────────────────────────────
      { id: 'station-label', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'transportation_name',
        filter: ['==', ['get', 'class'], 'rail'],
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-font': ['Noto Sans Regular'],
        },
        paint: {
          'text-color': c.place_village,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1.5,
        } },

      // ── Parks / green areas (Zone de Bois etc.) ────────────────────────────
      { id: 'park-label', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'park',
        filter: ['has', 'name'],
        minzoom: 11,
        layout: {
          'text-field': ['get', 'name'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.1,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 14, 11],
          'text-font': ['Noto Sans Regular'],
          'text-max-width': 6,
          'text-padding': 1,
        },
        paint: {
          'text-color': c.park_label,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1.5,
        } },

      // ── Named landuse zones ────────────────────────────────────────────────
      { id: 'landuse-label', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'landuse',
        filter: ['has', 'name'],
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 14, 11],
          'text-font': ['Noto Sans Regular'],
          'text-max-width': 7,
          'text-padding': 1,
        },
        paint: {
          'text-color': c.place_suburb,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1,
        } },

      // ── Neighbourhoods / suburbs / quarters ────────────────────────────────
      // Google Maps philosophy: Regular weight (not Bold), wide letter-spacing,
      // light grey — area labels are background context, not foreground content.
      // Bus routes are the foreground here; neighbourhood names help orient
      // without competing. symbol-sort-key on rank prioritises larger areas.
      { id: 'place-suburb', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood'], true, false],
        minzoom: 11,
        layout: {
          'text-field': ['get', 'name'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12,
          'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 14, 13],
          'text-font': ['Noto Sans Bold'],
          'text-max-width': 5,
          'text-padding': 0,
          'symbol-sort-key': ['get', 'rank'],
        },
        paint: {
          'text-color': c.place_village,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1.5,
        } },

      // ── Key landmark POIs — hospitals, universities, stations ──────────────
      { id: 'poi-landmark', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'poi',
        filter: ['all',
          ['has', 'name'],
          ['match', ['get', 'class'],
            ['aerodrome', 'airport', 'hospital', 'university', 'college', 'railway', 'bus', 'stadium', 'government'],
            true, false],
        ],
        minzoom: 13,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-font': ['Noto Sans Regular'],
          'text-anchor': 'top',
          'text-offset': [0, 0.3],
          'text-padding': 3,
          'text-max-width': 8,
        },
        paint: {
          'text-color': c.place_village,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1.5,
        } },

      // ── Generic POIs (zoom 15+) ────────────────────────────────────────────
      { id: 'poi-label', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'poi',
        filter: ['has', 'name'],
        minzoom: 15,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 10,
          'text-font': ['Noto Sans Regular'],
          'text-anchor': 'top',
          'text-offset': [0, 0.3],
          'text-padding': 2,
        },
        paint: {
          'text-color': c.place_suburb,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1,
        } },

      // ── Place labels ───────────────────────────────────────────────────────

      { id: 'place-village', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['village', 'hamlet'], true, false],
        minzoom: 11,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Noto Sans Regular'],
        },
        paint: {
          'text-color': c.place_village,
          'text-halo-color': c.label_halo,
          'text-halo-width': 1.5,
        } },

      { id: 'place-town', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'town'],
        minzoom: 9,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 13,
          'text-font': ['Noto Sans Bold'],
        },
        paint: {
          'text-color': c.place_town,
          'text-halo-color': c.label_halo,
          'text-halo-width': 2,
        } },

      { id: 'place-city', type: 'symbol',
        source: 'openmaptiles', 'source-layer': 'place',
        filter: ['match', ['get', 'class'], ['city', 'state'], true, false],
        layout: {
          'text-field': ['get', 'name'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 11, 14, 14, 20],
          'text-font': ['Noto Sans Bold'],
        },
        paint: {
          'text-color': c.place_city,
          'text-halo-color': c.label_halo,
          'text-halo-width': 2,
        } },
    ],
  }
}
