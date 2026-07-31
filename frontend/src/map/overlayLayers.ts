/**
 * Overlay sources/layers MiniMap draws on top of the basemap: route lines,
 * stop circles, clustered city stops, nearby-stop icons, and every position
 * marker (route endpoints, the current stop, a picked origin, GPS) - all GL
 * layers rather than HTML markers, so none of them can drift off the
 * canvas's own projected coordinate the way an HTML element overlaid on it
 * could.
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

// Route mode: origin dot + destination pin
export const ROUTE_FROM_SOURCE = 'mm-route-from'
const ROUTE_FROM_LAYER = 'mm-route-from-dot'
export const ROUTE_TO_SOURCE = 'mm-route-to'
const ROUTE_TO_LAYER = 'mm-route-to-pin'
export const ROUTE_TO_PIN_IMG = 'route-to-pin'

// Route / network mode: unclustered sequential stop markers
export const STOPS_SOURCE  = 'mm-stops'
const STOPS_LAYER   = 'mm-stops-circle'
const STOPS_SEQ_LAYER = 'mm-stops-seq'   // sequence number text for route mode

// Search mode: all city stops with native MapLibre clustering
export const STOPS_MAP_SOURCE = 'mm-stops-map'
const STOPS_CLUSTER_LAYER  = 'mm-stops-cluster'
const STOPS_COUNT_LAYER    = 'mm-stops-count'
const STOPS_POINT_LAYER    = 'mm-stops-point'

// Search mode: burst halo + enlarged icon for the currently selected stop
export const STOPS_SELECTED_SOURCE = 'mm-stops-selected'
const STOPS_SELECTED_LAYER = 'mm-stops-selected-halo'
const STOPS_SELECTED_ICON_LAYER = 'mm-stops-selected-icon'

// All modes: GPS "you are here" dot + pulsing ring + heading cone
// (Android/desktop only - see useDeviceHeading.ts)
export const USER_LOCATION_SOURCE = 'mm-user-location'
const USER_LOCATION_PULSE_LAYER = 'mm-user-location-pulse'
const USER_LOCATION_DOT_LAYER = 'mm-user-location-dot'
const USER_LOCATION_CONE_LAYER = 'mm-user-location-cone'
export const USER_LOCATION_CONE_IMG = 'user-location-cone'

// Network mode: every city stop as a background layer, deliberately not
// clustered (no bubble/count UI) - invisible zoomed out over most of the
// city, individual mode icons appear past minzoom (see STOPS_NETWORK_LAYER).
export const STOPS_NETWORK_SOURCE = 'mm-stops-network'
const STOPS_NETWORK_LAYER  = 'mm-stops-network-point'

// Stop mode: the stop currently being viewed (its own prominent marker) and
// nearby stops (small + muted, same bus-stop icon so they still read as
// stops at a glance).
export const CURRENT_STOP_SOURCE = 'mm-current-stop'
const CURRENT_STOP_LAYER = 'mm-current-stop-icon'
export const NEARBY_STOPS_SOURCE = 'mm-nearby-stops'
const NEARBY_STOPS_LAYER  = 'mm-nearby-stops-icon'

// Search mode: flag for an origin the user explicitly picked on the map.
export const ORIGIN_FLAG_SOURCE = 'mm-origin-flag'
const ORIGIN_FLAG_LAYER = 'mm-origin-flag-icon'
export const ORIGIN_FLAG_IMG = 'origin-flag-icon'

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
 * after the BUS_STOP_IMG / NEARBY_STOP_IMG / ROUTE_TO_PIN_IMG sprites are
 * registered (the symbol layers reference them). `accentColor` is read at
 * call time so a style reload after a theme switch picks up the new theme's
 * accent color.
 */
export function initOverlayLayers(map: MapLibreMap, accentColor: string): void {
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

  // ── Route endpoints (route mode's "from"/"to" markers) ────────────────────
  // GL layers instead of HTML markers, same reasoning as the other
  // conversions in this file: they share the canvas's own projected
  // coordinate exactly, so they can't drift the way an HTML element
  // overlaid on it could.
  map.addSource(ROUTE_FROM_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: ROUTE_FROM_LAYER,
    type: 'circle',
    source: ROUTE_FROM_SOURCE,
    paint: {
      'circle-radius': 9,
      'circle-color': accentColor,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 3,
    },
  })

  map.addSource(ROUTE_TO_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: ROUTE_TO_LAYER,
    type: 'symbol',
    source: ROUTE_TO_SOURCE,
    layout: {
      'icon-image': ROUTE_TO_PIN_IMG,
      'icon-size': 0.5,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
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

  // ── Current-stop source (stop mode) ───────────────────────────────────────
  // The stop being viewed, reusing the already-registered stopIconImg('bus')
  // sprite (see MiniMap.vue's loadStopIcons) - its color (--color-mode-bus)
  // matches --color-stop-dot exactly (see tokens.css), so this looks
  // identical to the old HTML marker it replaces without needing its own
  // sprite. A GL layer for the same reason as the selected-stop halo/user
  // location marker above: it can't drift off the canvas's own projected
  // coordinate the way an HTML element overlaid on it could.
  map.addSource(CURRENT_STOP_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: CURRENT_STOP_LAYER,
    type: 'symbol',
    source: CURRENT_STOP_SOURCE,
    layout: {
      'icon-image': stopIconImg('bus'),
      'icon-size': 0.5,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
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

  // ── Origin flag (search mode) ─────────────────────────────────────────────
  // A manually picked origin, GL layer for the same drift-proofing reason as
  // the other conversions in this file.
  map.addSource(ORIGIN_FLAG_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: ORIGIN_FLAG_LAYER,
    type: 'symbol',
    source: ORIGIN_FLAG_SOURCE,
    layout: {
      'icon-image': ORIGIN_FLAG_IMG,
      'icon-size': 0.5,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })

  // ── Selected-stop halo (search mode) ──────────────────────────────────────
  // A GL circle layer, not an HTML marker - it shares the exact same
  // projected coordinate as the stop's own icon (both read from a feature at
  // [lon, lat]), so it can't drift off-center the way overlaying a separate
  // HTML element on the WebGL canvas could. Animated by rewriting this
  // source's single feature's radius/opacity every frame (see MiniMap.vue's
  // startSelectedStopHalo) - MapLibre has no native paint-property animation.
  // Added before the icon layers below so the icon renders on top of it.
  map.addSource(STOPS_SELECTED_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: STOPS_SELECTED_LAYER,
    type: 'circle',
    source: STOPS_SELECTED_SOURCE,
    paint: {
      'circle-radius': ['get', 'radius'],
      'circle-color': ['get', 'color'],
      'circle-opacity': ['get', 'opacity'],
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
    // Same dim-the-rest treatment as STOPS_POINT_LAYER (search mode) - see
    // its own comment for why the enlarge itself is a separate layer
    // (STOPS_SELECTED_ICON_LAYER) instead of a case here too.
    paint: {
      'icon-opacity': ['case',
        ['==', ['get', 'selected'], 1], 1,
        ['==', ['get', 'anySelected'], 1], 0.35,
        1,
      ],
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
      'circle-color': accentColor,
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
  // modes (see stopIconImg()). 'selected'/'anySelected' are also set there,
  // from props.selectedStopId - every stop but the selected one dims while
  // one is selected (the selected stop's own enlarged icon is a separate
  // layer, STOPS_SELECTED_ICON_LAYER below - a style expression may only
  // contain one zoom-based interpolate, so it can't also be this layer's
  // size expression combined with a per-feature selected check).
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
    paint: {
      'icon-opacity': ['case',
        ['==', ['get', 'selected'], 1], 1,
        ['==', ['get', 'anySelected'], 1], 0.35,
        1,
      ],
    },
  })

  // Enlarged icon for the selected stop, drawn on top of (and over) its own
  // normal-sized icon above - same STOPS_SELECTED_SOURCE the burst halo
  // circle uses (see MiniMap.vue's startSelectedStopHalo), which only ever
  // holds the one selected stop's feature, so a plain zoom-interpolate here
  // is enough - no per-feature case needed since every feature in this
  // source already is the selected one.
  map.addLayer({
    id: STOPS_SELECTED_ICON_LAYER,
    type: 'symbol',
    source: STOPS_SELECTED_SOURCE,
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.75, 16, 1.05],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })

  // ── User location marker (GPS "you are here" dot) ────────────────────────
  // A GL layer instead of an HTML marker, same reasoning as the
  // selected-stop halo above: can't drift from the actual point the way an
  // HTML element overlaid on the WebGL canvas could, and compass ticks (see
  // MiniMap.vue's headingDeg watcher) can fire many times a second -
  // rewriting one feature's properties is far cheaper than tearing down
  // and rebuilding an HTML marker on each one. One feature on this source
  // carries radius/opacity (animated, the pulsing ring below),
  // heading/hasHeading (the cone's rotation and visibility). Added last so
  // it draws on top of everything else, same as an HTML marker always did.
  map.addSource(USER_LOCATION_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  // Cone first (bottom), so the ring/dot above sit visually in front of it.
  map.addLayer({
    id: USER_LOCATION_CONE_LAYER,
    type: 'symbol',
    source: USER_LOCATION_SOURCE,
    layout: {
      'icon-image': USER_LOCATION_CONE_IMG,
      'icon-size': 1,
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    // Only visible once a real compass reading exists - the feature (and
    // this layer) still exist with plain GPS alone, just fully transparent.
    paint: {
      'icon-opacity': ['case', ['==', ['get', 'hasHeading'], 1], 1, 0],
    },
  })

  map.addLayer({
    id: USER_LOCATION_PULSE_LAYER,
    type: 'circle',
    source: USER_LOCATION_SOURCE,
    paint: {
      'circle-radius': ['get', 'radius'],
      'circle-color': ['get', 'color'],
      'circle-opacity': ['get', 'opacity'],
    },
  })

  map.addLayer({
    id: USER_LOCATION_DOT_LAYER,
    type: 'circle',
    source: USER_LOCATION_SOURCE,
    paint: {
      'circle-radius': 8,
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2.5,
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
  map.on('click', STOPS_SELECTED_ICON_LAYER, emitStopClick)

  map.on('click', STOPS_CLUSTER_LAYER, onClusterClick)
  // The count label (symbol layer) sits on top of the circle and can swallow the
  // click before it reaches STOPS_CLUSTER_LAYER — register the same handler on it.
  map.on('click', STOPS_COUNT_LAYER, onClusterClick)

  for (const layer of [STOPS_LAYER, NEARBY_STOPS_LAYER, STOPS_CLUSTER_LAYER, STOPS_COUNT_LAYER, STOPS_POINT_LAYER, STOPS_NETWORK_LAYER, STOPS_SELECTED_ICON_LAYER]) {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = '' })
  }
}
