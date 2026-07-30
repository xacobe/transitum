/**
 * Overlay sources/layers MiniMap draws on top of the basemap: route lines,
 * stop circles, clustered city stops and nearby-stop icons.
 *
 * Split in two because they have different lifetimes:
 *  - initOverlayLayers(): sources + layers. setStyle() clears all of them, so
 *    this is re-called after every 'style.load' (idempotent via the source
 *    guard).
 *  - registerOverlayHandlers(): map event listeners. These live on the map
 *    itself and survive setStyle(), so they must be registered exactly once -
 *    re-registering them on every style reload (as a single combined init
 *    would) stacks duplicate click handlers and double-fires stop clicks
 *    after a theme or city switch.
 */
import type { Map as MapLibreMap, GeoJSONSource, MapMouseEvent, MapGeoJSONFeature } from 'maplibre-gl'
import type { Point } from 'geojson'
import type { TransitMode } from '@/types'

export const ROUTE_SOURCE  = 'mm-routes'
const ROUTE_BUS_ID  = 'mm-routes-bus'
const ROUTE_WALK_ID = 'mm-routes-walk'

// Route / network mode: unclustered sequential stop markers
export const STOPS_SOURCE  = 'mm-stops'
const STOPS_LAYER   = 'mm-stops-circle'
const STOPS_SEQ_LAYER = 'mm-stops-seq'   // sequence number text for route mode

// Search mode: all city stops with native MapLibre clustering
export const STOPS_MAP_SOURCE = 'mm-stops-map'
const STOPS_CLUSTER_LAYER  = 'mm-stops-cluster'
const STOPS_COUNT_LAYER    = 'mm-stops-count'
const STOPS_POINT_LAYER    = 'mm-stops-point'

// Network mode: every city stop as a background layer, deliberately not
// clustered (no bubble/count UI) - invisible zoomed out over most of the
// city, individual mode icons appear past minzoom (see STOPS_NETWORK_LAYER).
export const STOPS_NETWORK_SOURCE = 'mm-stops-network'
const STOPS_NETWORK_LAYER  = 'mm-stops-network-point'

// Stop mode: nearby-stop dots, small + muted, with the same bus-stop icon
// as the main "you are here" marker so they read as stops at a glance too.
export const NEARBY_STOPS_SOURCE = 'mm-nearby-stops'
const NEARBY_STOPS_LAYER  = 'mm-nearby-stops-icon'

// Named canvas sprites (registered in MiniMap via drawStopIcon + addImage).
// One per TransitMode for the main "all city stops" sprite, so a metro/tram/
// etc stop shows its own icon instead of a generic bus one - see
// stopIconImg()/loadStopIcons() in MiniMap.vue.
export const NEARBY_STOP_IMG = 'nearby-stop-icon'

export function stopIconImg(mode: TransitMode): string {
  return `stop-icon-${mode}`
}

export interface StopClickPayload { id: string; name: string; lat: number; lon: number }

/**
 * Adds all overlay sources and layers. Must run after the style is ready and
 * after the BUS_STOP_IMG / NEARBY_STOP_IMG sprites are registered (the symbol
 * layers reference them). `clusterColor` is read at call time so a style
 * reload after a theme switch picks up the new theme's stop color.
 */
export function initOverlayLayers(map: MapLibreMap, clusterColor: string): void {
  if (map.getSource(ROUTE_SOURCE)) return // already added (idempotent guard)

  map.addSource(ROUTE_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  // Walk legs: dashed dark line
  map.addLayer({
    id: ROUTE_WALK_ID,
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['==', ['get', 'walk'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 3,
      'line-opacity': ['get', 'opacity'],
      'line-dasharray': [0, 2],
    },
  })

  // Bus / route legs: solid colored line. 'dashed' is only ever set in
  // network mode, for a highlighted branching line's secondary destination
  // variants (see LinesView.vue's mapLegs) - everywhere else it's absent
  // and this falls through to a normal solid line.
  map.addLayer({
    id: ROUTE_BUS_ID,
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['!=', ['get', 'walk'], true],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['get', 'weight'],
      'line-opacity': ['get', 'opacity'],
      'line-dasharray': ['case', ['boolean', ['get', 'dashed'], false], ['literal', [2, 1.6]], ['literal', [1, 0]]],
    },
  })

  // ── Unclustered stop source (route + network modes) ──────────────────────
  map.addSource(STOPS_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: STOPS_LAYER,
    type: 'circle',
    source: STOPS_SOURCE,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 12.5, 4.5, 13, 9, 16, 12],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  })

  // Sequence number text for route mode stops (visible from zoom 13)
  map.addLayer({
    id: STOPS_SEQ_LAYER,
    type: 'symbol',
    source: STOPS_SOURCE,
    minzoom: 13,
    layout: {
      'text-field': ['get', 'seq'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 18,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': '#fff' },
  })

  // ── Nearby-stop source (stop mode) ────────────────────────────────────────
  // Small muted bus-stop icons for stops near the one being viewed - a
  // dedicated source/layer (not the plain circles above) since route/network
  // mode's STOPS_LAYER is a 'circle' type and can't swap to icons per-mode.
  map.addSource(NEARBY_STOPS_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: NEARBY_STOPS_LAYER,
    type: 'symbol',
    source: NEARBY_STOPS_SOURCE,
    layout: {
      'icon-image': NEARBY_STOP_IMG,
      'icon-size': 0.87,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })

  // ── Network stop source (network mode — all city stops, unclustered) ─────
  // No cluster bubbles here on purpose: zoomed out over most of the city
  // (viewing the network overview or a highlighted line) nothing shows at
  // all, keeping the route lines readable; past minzoom (one step in from
  // where "near me" lands - GeolocateControl caps network mode at zoom 14,
  // see MiniMap.vue - so a single zoom-out tap from there hides stops again)
  // mode-appropriate icons appear directly, no intermediate cluster-count step.
  map.addSource(STOPS_NETWORK_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: STOPS_NETWORK_LAYER,
    type: 'symbol',
    source: STOPS_NETWORK_SOURCE,
    minzoom: 14,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 16, 0.75],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })

  // ── Clustered stop source (search mode — all city stops) ─────────────────
  // MapLibre clusters points natively: the source merges nearby features into
  // a single cluster feature with a `point_count` property.
  map.addSource(STOPS_MAP_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterMaxZoom: 13, // individual stops visible from zoom 14+
    clusterRadius: 40,
  })

  // Cluster bubble
  map.addLayer({
    id: STOPS_CLUSTER_LAYER,
    type: 'circle',
    source: STOPS_MAP_SOURCE,
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': clusterColor,
      'circle-opacity': 0.85,
      'circle-radius': [
        'step', ['get', 'point_count'],
        14,  // < 5 stops
        5,  18,  // 5–19
        20, 22,  // 20+
      ],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  })

  // Cluster count label — font already present in the basemap style
  map.addLayer({
    id: STOPS_COUNT_LAYER,
    type: 'symbol',
    source: STOPS_MAP_SOURCE,
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 11,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#fff' },
  })

  // Individual (unclustered) stops — mode-appropriate icon symbol, visible
  // from zoom 13. Icons are pre-rendered canvas sprites (colored circle +
  // white SVG icon), one per TransitMode, registered before this function is
  // called; 'icon' is set per-feature in toStopFeature() from the stop's own
  // modes (see stopIconImg()).
  map.addLayer({
    id: STOPS_POINT_LAYER,
    type: 'symbol',
    source: STOPS_MAP_SOURCE,
    minzoom: 13,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 0.75],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })
}

/**
 * Registers the click/cursor listeners for the overlay layers. Call exactly
 * once per map instance (listeners survive setStyle, unlike layers).
 */
export function registerOverlayHandlers(
  map: MapLibreMap,
  onStopClick: (stop: StopClickPayload) => void,
): void {
  function emitStopClick(e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) {
    if (!e.features?.length) return
    const p = e.features[0].properties as StopClickPayload
    onStopClick({ id: p.id, name: p.name, lat: p.lat, lon: p.lon })
  }

  // Shared handler: tap a cluster (circle or count label) → zoom in to split it.
  // cluster_id can arrive as a string when MapLibre serialises feature properties,
  // so always coerce it with parseInt.
  async function onClusterClick(e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) {
    if (!e.features?.length) return
    const clusterId = parseInt(String(e.features[0].properties?.cluster_id), 10)
    const source = map.getSource(STOPS_MAP_SOURCE) as GeoJSONSource
    const coords = (e.features[0].geometry as Point).coordinates as [number, number]
    try {
      const zoom = await source.getClusterExpansionZoom(clusterId)
      map.easeTo({ center: coords, zoom })
    } catch {
      // fallback: just step in two levels
      map.easeTo({ center: coords, zoom: (map.getZoom() ?? 10) + 2 })
    }
  }

  map.on('click', STOPS_LAYER, emitStopClick)
  map.on('click', NEARBY_STOPS_LAYER, emitStopClick)
  // Tap an individual (unclustered) stop → same payload for the parent panel
  map.on('click', STOPS_POINT_LAYER, emitStopClick)
  map.on('click', STOPS_NETWORK_LAYER, emitStopClick)

  map.on('click', STOPS_CLUSTER_LAYER, onClusterClick)
  // The count label (symbol layer) sits on top of the circle and can swallow the
  // click before it reaches STOPS_CLUSTER_LAYER — register the same handler on it.
  map.on('click', STOPS_COUNT_LAYER, onClusterClick)

  for (const layer of [STOPS_LAYER, NEARBY_STOPS_LAYER, STOPS_CLUSTER_LAYER, STOPS_COUNT_LAYER, STOPS_POINT_LAYER, STOPS_NETWORK_LAYER]) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
  }
}
