<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import maplibregl, { type GeoJSONSource, type MapMouseEvent, type MapGeoJSONFeature } from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol, PMTiles } from 'pmtiles'
import busStopSvg from '@tabler/icons/outline/bus-stop.svg?raw'
import flagSvg    from '@tabler/icons/outline/flag-3.svg?raw'
import { useOfflineTiles } from '@/composables/useOfflineTiles'

// Set once when this chunk is first loaded (before any map instance is created).
// Kept here rather than main.js so maplibre-gl stays in the lazy MiniMap chunk
// and is not pulled into the main bundle.
;(maplibregl as typeof maplibregl & { workerCount: number }).workerCount = 1
import { useThemeStore } from '@/stores/theme'
import { useCityStore } from '@/stores/city'
import { useLineColor } from '@/composables/useLineColor'
import { buildMapStyle } from '@/map/style'
import type { MapLeg } from '@/types'

type Anchor = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

// Register the pmtiles:// protocol once globally. addProtocol is idempotent
// so calling it in every MiniMap instance is safe (only the first takes effect).
const pmtilesProtocol = new Protocol()
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile)

// Serves byte-range requests for a locally-stored Blob (offline tiles).
// The PMTiles library calls getBytes(offset, length) for each tile it needs;
// we slice the Blob on demand instead of loading the whole file into memory.
class BlobSource {
  private _blob: Blob
  private _key: string
  constructor(blob: Blob, key: string) { this._blob = blob; this._key = key }
  getKey() { return this._key }
  async getBytes(offset: number, length: number) {
    const buf = await this._blob.slice(offset, offset + length).arrayBuffer()
    return { data: buf }
  }
}

const props = withDefaults(defineProps<{
  mode: 'search' | 'route' | 'stop' | 'network'
  center?: [number, number]
  from?: [number, number]
  to?: [number, number]
  routeLegs?: MapLeg[]
  stops?: { id?: string; name?: string; lat: number; lon: number }[]
  highlightedKey?: string
  /** Route mode: pulses/enlarges the matching stop from `stops` - e.g. the
   * one MapStopPanel is currently open for (LineView). Own lightweight
   * watcher below, not routed through the main render() cycle, since route
   * mode's render() unconditionally re-fits the camera to the whole route -
   * selecting a stop shouldn't yank the view away from wherever the user
   * had it. */
  selectedStopId?: string
  /** GPS position → pulsing dot (all modes) */
  userPosition?: [number, number]
  /** Manually picked origin → flag marker (search mode) */
  pickedPoint?: { lat: number; lon: number }
  /** Enable right-click / long-press pick-origin / pick-destination menu */
  pickMenu?: boolean
  /** Network mode: skip the fitBounds/easeTo that normally follows a
   * highlightedKey change - e.g. selecting a line from the stop popup
   * shouldn't yank the view away from the stop the user was just looking at. */
  keepView?: boolean
}>(), {
  routeLegs: () => [],
  stops: () => [],
})

const emit = defineEmits(['stop-click', 'geolocate', 'geolocate-error', 'pick-origin', 'pick-destination'])

const theme    = useThemeStore()
const city     = useCityStore()
const { colorFor } = useLineColor()
const { t } = useI18n()

const mapEl = ref<HTMLDivElement | null>(null)
const { getOfflineBlob } = useOfflineTiles()
let map: maplibregl.Map | null = null
// Hoisted (not just a local in onMounted) so triggerGeolocate() below can
// reach it - programmatically firing the same control a parent would
// otherwise need its own separate geolocation call + camera work to
// replicate (see LinesView's "near me" button).
let geoCtrl: maplibregl.GeolocateControl | null = null
let styleReady      = false
let markers: maplibregl.Marker[] = []
// Kept separate from `markers` (which the main render() cycle bulk-clears
// on every call) - see selectedStopId's own doc comment for why this has
// its own lightweight update path instead.
let selectedStopMarker: maplibregl.Marker | null = null
let detailThreshold = 0
// Stop mode: coordinate key of the stop last framed by render() - see its
// "Stop mode" branch below.
let lastStopFocusKey: string | null = null

// Context-menu popup (right-click / long-press to pick origin or destination)
let pickPopup: maplibregl.Popup | null = null
// Long-press state (mobile)
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let mapCanvasEl: HTMLCanvasElement | null = null

// ── Coordinate helpers ─────────────────────────────────────────────────────
// Our data uses [lat, lon] arrays (OTP / Leaflet convention).
// MapLibre and GeoJSON use [lon, lat].  Always convert at the boundary.
type LatLon = [number, number]
const toLngLat   = ([lat, lon]: LatLon): [number, number] => [lon, lat]
const toGeoCoord = ([lat, lon]: LatLon): [number, number] => [lon, lat]

function pointsToCoords(points: LatLon[]): [number, number][] {
  return points.map(toGeoCoord)
}

// ── PMTiles source ─────────────────────────────────────────────────────────
// Returns the URL or key to use as the vector tile source. If the city's
// tiles are downloaded offline (IndexedDB Blob), registers a BlobSource
// with the pmtiles protocol and returns its key; otherwise returns the
// remote URL. Called once on mount, result stored in activeTileUrl.
let activeTileUrl = ''

async function resolveTileUrl() {
  const slug = city.activeCity.slug
  const blob = await getOfflineBlob(slug)
  if (blob) {
    const key = `offline-${slug}`
    // Register the BlobSource so pmtiles protocol routes tile requests
    // to the local Blob instead of the network.
    pmtilesProtocol.add(new PMTiles(new BlobSource(blob, key)))
    return `pmtiles://${key}`
  }
  return `pmtiles://${window.location.origin}/data/${slug}/tiles.pmtiles`
}

// ── Bounds helpers ─────────────────────────────────────────────────────────
// Returns MapLibre LngLatBoundsLike: [[minLon, minLat], [maxLon, maxLat]]
function latLonArrayToBounds(points: LatLon[]): [[number, number], [number, number]] {
  const lats = points.map(p => p[0])
  const lons = points.map(p => p[1])
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ]
}

// Trim the most extreme trimRatio of points from the lat/lon distributions
// before computing bounds — prevents a few long intercommunal lines from
// forcing the network overview to zoom out 2-3x further than necessary.
function percentileBounds(points: LatLon[], trimRatio = 0.02): [[number, number], [number, number]] {
  const lats = points.map(p => p[0]).sort((a, b) => a - b)
  const lons = points.map(p => p[1]).sort((a, b) => a - b)
  const at = (sorted: number[], r: number) => sorted[Math.round((sorted.length - 1) * r)]
  return [
    [at(lons, trimRatio),     at(lats, trimRatio)],
    [at(lons, 1 - trimRatio), at(lats, 1 - trimRatio)],
  ]
}

// ── Overlay layer management ───────────────────────────────────────────────
// Bus route lines are drawn as a GeoJSON source + two line layers (solid bus,
// dashed walk). They live on top of the basemap and are re-added after every
// style change (setStyle clears all sources/layers).

const ROUTE_SOURCE  = 'mm-routes'
const ROUTE_BUS_ID  = 'mm-routes-bus'
const ROUTE_WALK_ID = 'mm-routes-walk'

// Route / network mode: unclustered sequential stop markers
const STOPS_SOURCE  = 'mm-stops'
const STOPS_LAYER   = 'mm-stops-circle'
const STOPS_SEQ_LAYER = 'mm-stops-seq'   // sequence number text for route mode

// Search mode: all city stops with native MapLibre clustering
const STOPS_MAP_SOURCE     = 'mm-stops-map'
const STOPS_CLUSTER_LAYER  = 'mm-stops-cluster'
const STOPS_COUNT_LAYER    = 'mm-stops-count'
const STOPS_POINT_LAYER    = 'mm-stops-point'

// Stop mode: nearby-stop dots, small + muted, with the same bus-stop icon
// as the main "you are here" marker so they read as stops at a glance too.
const NEARBY_STOPS_SOURCE = 'mm-nearby-stops'
const NEARBY_STOPS_LAYER  = 'mm-nearby-stops-icon'

// Reads a color custom property live (theme.css/tokens.css) - for contexts
// that need a literal string (canvas fillStyle, MapLibre GL paint
// properties, marker element.style assignments), not a CSS var() the
// browser can re-resolve on its own on a theme change.
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const stopColor    = () => cssVar('--color-stop-dot')
const BUS_STOP_IMG  = 'bus-stop-icon'
const NEARBY_STOP_IMG = 'nearby-stop-icon'

// Draws a blue circle + white bus-stop SVG onto a canvas, then registers the
// result as a named ImageData sprite in MapLibre. Shared by loadBusStopIcon
// (main "you are here" marker) and loadNearbyStopIcon (smaller, muted dots
// for nearby stops) - same drawing, different size/color/stroke.
async function drawStopIcon(size: number, color: string, strokeWidth: number): Promise<ImageData> {
  const inner = Math.round(size * 0.52)
  const pad   = Math.round((size - inner) / 2)

  const canvas = document.createElement('canvas')
  canvas.width  = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = strokeWidth
  ctx.stroke()

  const svgWhite = busStopSvg.replace(/currentColor/g, '#fff')
  await new Promise<void>((resolve) => {
    const blob = new Blob([svgWhite], { type: 'image/svg+xml' })
    const url  = URL.createObjectURL(blob)
    const img  = new Image()
    img.onload = () => { ctx.drawImage(img, pad, pad, inner, inner); URL.revokeObjectURL(url); resolve() }
    img.onerror = () => { URL.revokeObjectURL(url); resolve() }
    img.src = url
  })

  return ctx.getImageData(0, 0, size, size)
}

// Must be awaited before initOverlayLayers() so the symbol layer can reference
// the image.  Re-called after setStyle() which clears all custom images.
// Uses a module-level promise to prevent double-registration when 'load' and
// 'style.load' fire close together on initial mount.
let busIconPromise: Promise<void> | null = null

async function loadBusStopIcon() {
  if (!map) return
  if (map.hasImage(BUS_STOP_IMG)) return
  if (busIconPromise) { await busIconPromise; return }

  busIconPromise = (async () => {
    // 2× canvas for crisp rendering on retina displays.
    const imageData = await drawStopIcon(68, stopColor(), 4)  // logical 34px × 2
    if (map && !map.hasImage(BUS_STOP_IMG)) {
      map.addImage(BUS_STOP_IMG, imageData, { pixelRatio: 2 })
    }
  })()

  await busIconPromise
  busIconPromise = null
}

let nearbyIconPromise: Promise<void> | null = null

async function loadNearbyStopIcon() {
  if (!map) return
  if (map.hasImage(NEARBY_STOP_IMG)) return
  if (nearbyIconPromise) { await nearbyIconPromise; return }

  nearbyIconPromise = (async () => {
    // Smaller and in --color-sep (muted) rather than the accent stop color,
    // so it reads as secondary next to the main "you are here" marker.
    const imageData = await drawStopIcon(44, cssVar('--color-sep'), 3)  // logical 22px × 2
    if (map && !map.hasImage(NEARBY_STOP_IMG)) {
      map.addImage(NEARBY_STOP_IMG, imageData, { pixelRatio: 2 })
    }
  })()

  await nearbyIconPromise
  nearbyIconPromise = null
}

function initOverlayLayers() {
  if (!map || !styleReady) return
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

  map.on('click', STOPS_LAYER, (e) => {
    if (!e.features?.length) return
    const p = e.features[0].properties as { id: string; name: string; lat: number; lon: number }
    emit('stop-click', { id: p.id, name: p.name, lat: p.lat, lon: p.lon })
  })
  map.on('mouseenter', STOPS_LAYER, () => { if (map) map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', STOPS_LAYER, () => { if (map) map.getCanvas().style.cursor = '' })

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

  map.on('click', NEARBY_STOPS_LAYER, (e) => {
    if (!e.features?.length) return
    const p = e.features[0].properties as { id: string; name: string; lat: number; lon: number }
    emit('stop-click', { id: p.id, name: p.name, lat: p.lat, lon: p.lon })
  })
  map.on('mouseenter', NEARBY_STOPS_LAYER, () => { if (map) map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', NEARBY_STOPS_LAYER, () => { if (map) map.getCanvas().style.cursor = '' })

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
      'circle-color': stopColor(),
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

  // Individual (unclustered) stops — bus-stop icon symbol, visible from zoom 13.
  // The icon is a pre-rendered canvas sprite (blue circle + white SVG icon)
  // registered via loadBusStopIcon() before initOverlayLayers() is called.
  map.addLayer({
    id: STOPS_POINT_LAYER,
    type: 'symbol',
    source: STOPS_MAP_SOURCE,
    minzoom: 13,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': BUS_STOP_IMG,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 13, 0.5, 16, 0.75],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  })

  // Shared handler: tap a cluster (circle or count label) → zoom in to split it.
  // cluster_id can arrive as a string when MapLibre serialises feature properties,
  // so always coerce it with parseInt.
  async function onClusterClick(e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) {
    if (!e.features?.length || !map) return
    const clusterId = parseInt(String(e.features[0].properties?.cluster_id), 10)
    const source = map.getSource(STOPS_MAP_SOURCE) as GeoJSONSource
    const coords = (e.features[0].geometry as { coordinates: [number, number] }).coordinates
    try {
      const zoom = await source.getClusterExpansionZoom(clusterId)
      map?.easeTo({ center: coords, zoom })
    } catch {
      // fallback: just step in two levels
      map?.easeTo({ center: coords, zoom: (map.getZoom() ?? 10) + 2 })
    }
  }

  map.on('click', STOPS_CLUSTER_LAYER, onClusterClick)
  // The count label (symbol layer) sits on top of the circle and can swallow the
  // click before it reaches STOPS_CLUSTER_LAYER — register the same handler on it.
  map.on('click', STOPS_COUNT_LAYER, onClusterClick)

  // Tap an individual stop → emit for the parent to show the panel
  map.on('click', STOPS_POINT_LAYER, (e) => {
    if (!e.features?.length) return
    const p = e.features[0].properties as { id: string; name: string; lat: number; lon: number }
    emit('stop-click', { id: p.id, name: p.name, lat: p.lat, lon: p.lon })
  })

  for (const layer of [STOPS_CLUSTER_LAYER, STOPS_COUNT_LAYER]) {
    map.on('mouseenter', layer, () => { if (map) map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', layer, () => { if (map) map.getCanvas().style.cursor = '' })
  }
  map.on('mouseenter', STOPS_POINT_LAYER, () => { if (map) map.getCanvas().style.cursor = 'pointer' })
  map.on('mouseleave', STOPS_POINT_LAYER, () => { if (map) map.getCanvas().style.cursor = '' })
}

function setRouteFeatures(features: object[]) {
  if (!map || !styleReady || !map.getSource(ROUTE_SOURCE)) return
  ;(map.getSource(ROUTE_SOURCE) as GeoJSONSource).setData({
    type: 'FeatureCollection',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    features: features as any[],
  })
}

function setStopFeatures(features: object[]) {
  if (!map || !styleReady || !map.getSource(STOPS_SOURCE)) return
  ;(map.getSource(STOPS_SOURCE) as GeoJSONSource).setData({
    type: 'FeatureCollection',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    features: features as any[],
  })
}

function setMapStopFeatures(features: object[]) {
  if (!map || !styleReady || !map.getSource(STOPS_MAP_SOURCE)) return
  ;(map.getSource(STOPS_MAP_SOURCE) as GeoJSONSource).setData({
    type: 'FeatureCollection',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    features: features as any[],
  })
}

function setNearbyStopFeatures(features: object[]) {
  if (!map || !styleReady || !map.getSource(NEARBY_STOPS_SOURCE)) return
  ;(map.getSource(NEARBY_STOPS_SOURCE) as GeoJSONSource).setData({
    type: 'FeatureCollection',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    features: features as any[],
  })
}

function toStopFeature(
  s: { id?: string; name?: string; lat: number; lon: number },
  color: string,
  extra: Record<string, string | number> = {},
) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    properties: { id: s.id ?? '', name: s.name ?? '', lat: s.lat, lon: s.lon, color, ...extra },
  }
}

// ── Marker helpers ─────────────────────────────────────────────────────────
function clearMarkers() {
  markers.forEach(m => m.remove())
  markers = []
}

function addMarker(el: HTMLElement, lngLat: [number, number], anchor: Anchor = 'center') {
  const m = new maplibregl.Marker({ element: el, anchor })
    .setLngLat(lngLat)
    .addTo(map!)
  markers.push(m)
  return m
}

function pulseMarker(lngLat: [number, number], color: string, size = 18) {
  const wrap = document.createElement('div')
  Object.assign(wrap.style, {
    position: 'relative', width: `${size}px`, height: `${size}px`, pointerEvents: 'none',
  })

  const ring = document.createElement('div')
  Object.assign(ring.style, {
    position: 'absolute', inset: '-8px', borderRadius: '50%',
    background: color, animation: 'mm-pulse 2.6s ease-out infinite',
  })

  const dot = document.createElement('div')
  Object.assign(dot.style, {
    position: 'absolute', inset: '0', borderRadius: '50%',
    background: color, border: '3px solid #fff',
    boxShadow: '0 2px 7px rgba(0,0,0,.35)',
  })

  wrap.appendChild(ring)
  wrap.appendChild(dot)
  addMarker(wrap, lngLat, 'center')
}

function pinMarker(lngLat: [number, number], color: string) {
  const el = document.createElement('div')
  Object.assign(el.style, {
    width: '20px', height: '20px',
    borderRadius: '50% 50% 50% 0',
    background: color, border: '2px solid #fff',
    boxShadow: '0 3px 7px rgba(0,0,0,.3)',
    transform: 'rotate(-45deg)',
  })
  addMarker(el, lngLat, 'bottom')
}

function smallDotMarker(lngLat: [number, number], color: string, onClick: () => void) {
  const el = document.createElement('div')
  Object.assign(el.style, {
    width: '10px', height: '10px', borderRadius: '50%',
    background: color, boxShadow: '0 1px 3px rgba(0,0,0,.3)', cursor: 'pointer',
  })
  el.addEventListener('click', onClick)
  addMarker(el, lngLat, 'center')
}

function numberedDotMarker(lngLat: [number, number], num: number, color: { bg: string; text: string }, onClick: () => void) {
  const el = document.createElement('div')
  Object.assign(el.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '20px', height: '20px', borderRadius: '50%',
    background: color.bg, color: color.text,
    font: '700 8px/1 system-ui,sans-serif',
    boxShadow: '0 1px 4px rgba(0,0,0,.35)', cursor: 'pointer',
  })
  el.textContent = String(num)
  el.addEventListener('click', onClick)
  addMarker(el, lngLat, 'center')
}

function originFlagMarker(lngLat: [number, number]) {
  const color = cssVar('--color-accent')
  const el = document.createElement('div')
  Object.assign(el.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '34px', height: '34px', borderRadius: '50%',
    background: color, border: '2.5px solid #fff',
    boxShadow: '0 2px 7px rgba(0,0,0,.35)',
    color: '#fff', pointerEvents: 'none',
  })
  el.innerHTML = flagSvg
  const svg = el.querySelector('svg')
  if (svg) Object.assign(svg.style, { width: '18px', height: '18px', flexShrink: '0' })
  addMarker(el, lngLat, 'center')
}

function busStopMarker(lngLat: [number, number], onClick: () => void) {
  const el = document.createElement('div')
  Object.assign(el.style, {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '34px', height: '34px', borderRadius: '50%',
    background: stopColor(), border: '2.5px solid #fff',
    boxShadow: '0 1px 4px rgba(0,0,0,.35)',
    cursor: 'pointer', color: '#fff',
  })
  el.innerHTML = busStopSvg
  const svg = el.querySelector('svg')
  if (svg) Object.assign(svg.style, { width: '18px', height: '18px', flexShrink: '0' })
  el.addEventListener('click', onClick)
  addMarker(el, lngLat, 'center')
}

// ── Stop color ─────────────────────────────────────────────────────────────
function stopDotColor() {
  if (props.mode === 'route' && props.routeLegs.length > 0) {
    const leg = props.routeLegs[0]
    return colorFor(leg.routeShortName ?? '', leg.routeAgencyId)
  }
  if (props.mode === 'network' && props.highlightedKey) {
    const leg = props.routeLegs.find(l => l.key === props.highlightedKey)
    if (leg) return colorFor(leg.routeShortName ?? '', leg.routeAgencyId)
  }
  return { bg: stopColor(), text: '#fff' }
}

// ── Stop rendering ─────────────────────────────────────────────────────────
function renderStops() {
  if (!map || !styleReady) return

  clearMarkers()
  renderFromTo()

  // route mode: intermediate stops as unclustered GL circles + sequence numbers.
  // Endpoints keep their HTML markers (pulseMarker + pinMarker from renderFromTo).
  if (props.mode === 'route') {
    const color = stopDotColor().bg
    const n = props.stops.length
    setStopFeatures(
      props.stops
        .filter((_, i) => i !== 0 && i !== n - 1)
        .map((s, i) => toStopFeature(s, color, { seq: String(i + 2) })),
    )
    setMapStopFeatures([])
    return
  }

  // network mode: highlighted line stops as unclustered GL circles.
  if (props.mode === 'network') {
    const color = stopDotColor().bg
    setStopFeatures(props.stops.map((s) => toStopFeature(s, color)))
    setMapStopFeatures([])
    return
  }

  // search mode: all city stops via the clustered GL source.
  // Clustering is handled natively by MapLibre — no per-feature JS needed.
  if (props.mode === 'search') {
    setStopFeatures([])
    setMapStopFeatures(props.stops.map((s) => toStopFeature(s, stopColor())))
    return
  }

  // stop mode: the current stop is the single HTML marker already placed by
  // renderFromTo(); nearby stops (props.stops, if passed) are small muted
  // bus-stop icons (NEARBY_STOPS_LAYER) - a quick spatial hint, not meant to
  // compete with the main marker.
  if (props.mode === 'stop') {
    setNearbyStopFeatures(props.stops.map((s) => toStopFeature(s, '')))
    setStopFeatures([])
    setMapStopFeatures([])
    return
  }

  setNearbyStopFeatures([])
  setStopFeatures([])
  setMapStopFeatures([])
}

// Pulsing/enlarged marker over whichever stop selectedStopId points at (see
// its prop doc comment) - own marker variable and update path, deliberately
// outside renderStops()/render() so selecting a stop never re-triggers route
// mode's unconditional fitBounds.
function updateSelectedStopMarker() {
  selectedStopMarker?.remove()
  selectedStopMarker = null
  if (!map || !styleReady || !props.selectedStopId) return
  const stop = props.stops.find((s) => s.id === props.selectedStopId)
  if (!stop) return

  const color = stopDotColor().bg
  const size = 26
  const wrap = document.createElement('div')
  Object.assign(wrap.style, {
    position: 'relative', width: `${size}px`, height: `${size}px`, pointerEvents: 'none',
  })
  const ring = document.createElement('div')
  Object.assign(ring.style, {
    position: 'absolute', inset: '-10px', borderRadius: '50%',
    background: color, animation: 'mm-pulse 1.8s ease-out infinite',
  })
  const dot = document.createElement('div')
  Object.assign(dot.style, {
    position: 'absolute', inset: '0', borderRadius: '50%',
    background: color, border: '3px solid #fff',
    boxShadow: '0 2px 8px rgba(0,0,0,.4)',
  })
  wrap.appendChild(ring)
  wrap.appendChild(dot)
  selectedStopMarker = new maplibregl.Marker({ element: wrap, anchor: 'center' })
    .setLngLat(toLngLat([stop.lat, stop.lon]))
    .addTo(map)
}

// ── From / To markers ──────────────────────────────────────────────────────
function solidOriginMarker(lngLat: [number, number], color: string) {
  const el = document.createElement('div')
  Object.assign(el.style, {
    width: '18px', height: '18px', borderRadius: '50%',
    background: color, border: '3px solid #fff',
    boxShadow: '0 2px 7px rgba(0,0,0,.35)',
    pointerEvents: 'none',
  })
  addMarker(el, lngLat, 'center')
}

function renderFromTo() {
  const accent = cssVar('--color-accent')
  const pin    = cssVar('--color-map-pin')

  if (props.mode === 'route' && props.from && props.to) {
    solidOriginMarker(toLngLat(props.from), accent)
    pinMarker(toLngLat(props.to), pin)
  } else if (props.mode === 'stop' && props.center) {
    busStopMarker(toLngLat(props.center), () => {})
  } else if (props.mode === 'search') {
    // Flag for an origin the user explicitly picked on the map.
    if (props.pickedPoint) {
      originFlagMarker(toLngLat([props.pickedPoint.lat, props.pickedPoint.lon]))
    }
  }

  // All modes: pulse marker for the user's actual GPS position.
  if (props.userPosition) pulseMarker(toLngLat(props.userPosition), accent, 18)
}

// ── Main render ────────────────────────────────────────────────────────────
function render() {
  if (!map || !styleReady) return

  map.resize() // recalculate viewport if container changed size

  clearMarkers()
  renderFromTo()

  // ── Route mode ────────────────────────────────────────────────────────────
  if (props.mode === 'route' && props.from && props.to) {
    const legs = props.routeLegs.length > 0
      ? props.routeLegs
      : [{ mode: 'BUS' as const, points: [props.from!, props.to!], routeShortName: null, routeAgencyId: null }]

    const features = legs
      .filter(leg => leg.points.length > 0)
      .map(leg => {
        const isWalk = leg.mode === 'WALK'
        const color  = isWalk
          ? cssVar('--color-walk-line')
          : colorFor(leg.routeShortName ?? leg.mode, leg.routeAgencyId).bg
        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: pointsToCoords(leg.points) },
          properties: {
            color,
            opacity: leg.dashed ? 0.6 : 0.9,
            weight:  leg.dashed ? 3 : 5,
            walk:    isWalk,
            dashed:  !!leg.dashed,
          },
        }
      })

    setRouteFeatures(features)

    const bounds = latLonArrayToBounds(
      [props.from!, props.to!, ...legs.flatMap(l => l.points)]
    )
    map.fitBounds(bounds, { animate: false, padding: 30 })
    detailThreshold = map.getZoom() + 1

  // ── Network mode ──────────────────────────────────────────────────────────
  } else if (props.mode === 'network') {
    const allPoints: [number, number][] = []
    let   highlightedPts: [number, number][] = []

    const ordered = [...props.routeLegs].sort((a, b) =>
      a.key === props.highlightedKey ? 1 : b.key === props.highlightedKey ? -1 : 0
    )

    const features = ordered
      .filter(leg => leg.points?.length > 0)
      .map(leg => {
        allPoints.push(...leg.points)
        const isHighlighted = props.highlightedKey && leg.key === props.highlightedKey
        const isDimmed      = props.highlightedKey && !isHighlighted
        // Dashed extra branches only exist for the highlighted line (see
        // LinesView.vue's mapLegs) - fold their points into the fitBounds
        // target too, so selecting a branching line frames its whole
        // network, not just the primary branch.
        if (isHighlighted) highlightedPts.push(...leg.points)

        return {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: pointsToCoords(leg.points) },
          properties: {
            color:   colorFor(leg.routeShortName ?? '', leg.routeAgencyId).bg,
            opacity: isDimmed ? 0.2 : (leg.dashed ? 0.65 : 0.9),
            weight:  isDimmed ? 5 : (leg.dashed ? 4 : 7),
            walk:    false,
            dashed:  !!leg.dashed,
          },
        }
      })

    setRouteFeatures(features)

    if (!props.keepView) {
      if (highlightedPts.length > 0) {
        // Zoom to the selected line so the user can see it clearly.
        map.fitBounds(latLonArrayToBounds(highlightedPts), { animate: false, padding: 20 })
      } else {
        // No line selected: show the city centre at a comfortable city-level
        // zoom. fitBounds on the full network would zoom out to include outlier
        // intercommunal lines (Ziniaré, Saponé) far from the urban core.
        const c = city.activeCity.center
        map.easeTo({ center: [c.lon, c.lat], zoom: 12, duration: 350 })
      }
    }

    detailThreshold = map.getZoom() + 1

  // ── Stop mode ──────────────────────────────────────────────────────────────
  // Always frame the specific stop, once its coordinates are known. Unlike
  // search mode below, there's no "don't move if already visible" case worth
  // optimizing for here: props.center starts undefined (stop data loads
  // async after mount) and by the time it resolves, the city-overview
  // fallback view already "contains" it at zoom 12 - the search mode
  // viewport check would silently never zoom to the actual stop.
  } else if (props.mode === 'stop') {
    setRouteFeatures([])
    const c = city.activeCity.center
    if (props.center) {
      const key = `${props.center[0]},${props.center[1]}`
      if (key !== lastStopFocusKey) {
        lastStopFocusKey = key
        map.setCenter(toLngLat(props.center))
        map.setZoom(15)
      }
    } else {
      map.setCenter([c.lon, c.lat])
      map.setZoom(12)
    }
    detailThreshold = map.getZoom() + 1

  // ── Search mode ────────────────────────────────────────────────────────────
  } else {
    setRouteFeatures([])
    const c = city.activeCity.center
    // Ignore props.center if it's from a different city (e.g. GPS from the city
    // the user is physically in while browsing a different selected city).
    // Simple haversine check — cities in the network are 100+ km apart.
    const inActiveCity = props.center && (() => {
      const [lat, lon] = props.center!
      const R = 6371
      const dLat = (lat - c.lat) * Math.PI / 180
      const dLon = (lon - c.lon) * Math.PI / 180
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat * Math.PI / 180) * Math.cos(c.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 60
    })()

    if (inActiveCity) {
      const lngLat = toLngLat(props.center!)
      // Only pan/zoom when the new center is outside the current viewport.
      if (!map.getBounds().contains(lngLat)) {
        map.setCenter(lngLat)
        if (map.getZoom() < 14) map.setZoom(15)
      }
    } else {
      // No center in the active city: show city overview zoom.
      map.setCenter([c.lon, c.lat])
      map.setZoom(12)
    }
    detailThreshold = map.getZoom() + 1
  }

  renderStops()
  updateSelectedStopMarker()
}

// ── Pick-location context menu ────────────────────────────────────────────
// Opens a small floating popup at the tapped coordinates with two actions.
// CSS for the popup content is injected once (see injectPickMenuStyle below).
function showPickMenu(lng: number, lat: number) {
  if (!map || !props.pickMenu) return
  pickPopup?.remove()

  const wrap = document.createElement('div')
  wrap.className = 'mm-pick-menu'

  function makeBtn(label: string, className: string, onClick: () => void) {
    const btn = document.createElement('button')
    btn.className = className
    btn.textContent = label
    btn.addEventListener('click', () => { pickPopup?.remove(); pickPopup = null; onClick() })
    return btn
  }

  wrap.appendChild(makeBtn(t('home.useAsOrigin'),      'mm-pick-origin', () => emit('pick-origin',      { lat, lon: lng })))
  wrap.appendChild(makeBtn(t('home.useAsDestination'), 'mm-pick-dest',   () => emit('pick-destination', { lat, lon: lng })))

  pickPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: true, offset: 12 })
    .setLngLat([lng, lat])
    .setDOMContent(wrap)
    .addTo(map)

  pickPopup.on('close', () => { pickPopup = null })
}

// ── Long-press (mobile) ───────────────────────────────────────────────────
// Standard touch interaction for "drop a pin" (Google Maps, Apple Maps, etc.)
function onTouchStart(e: TouchEvent) {
  if (!map || e.touches.length !== 1 || !props.pickMenu) return
  const touch = e.touches[0]
  const startX = touch.clientX
  const startY = touch.clientY
  longPressTimer = setTimeout(() => {
    longPressTimer = null
    if (!map || !mapCanvasEl) return
    const rect = mapCanvasEl.getBoundingClientRect()
    const pt = map.unproject([startX - rect.left, startY - rect.top])
    showPickMenu(pt.lng, pt.lat)
  }, 500)
}
function onTouchMove() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
}
function onTouchEnd() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
}

// ── Marker styles ──────────────────────────────────────────────────────────
// All marker styles are applied inline so they work regardless of when Vite
// injects component CSS — MapLibre appends marker elements outside Vue's
// component tree and the injection timing is not guaranteed.
// Only @keyframes can't be inlined; we inject those once via a <style> tag.
const MARKER_STYLE_ID = 'mm-keyframes'
function injectKeyframes() {
  if (document.getElementById(MARKER_STYLE_ID)) return
  const s = document.createElement('style')
  s.id = MARKER_STYLE_ID
  s.textContent = `@keyframes mm-pulse{0%{transform:scale(.5);opacity:.5}70%{opacity:0}100%{transform:scale(2.2);opacity:0}}`
  document.head.appendChild(s)
}

const PICK_MENU_STYLE_ID = 'mm-pick-menu-style'
function injectPickMenuStyle() {
  if (document.getElementById(PICK_MENU_STYLE_ID)) return
  const s = document.createElement('style')
  s.id = PICK_MENU_STYLE_ID
  s.textContent = `
    .mm-pick-menu{display:flex;flex-direction:column;gap:4px;min-width:150px;padding:2px 0}
    .mm-pick-menu button{
      display:block;width:100%;padding:8px 12px;border-radius:6px;
      text-align:left;font:600 13px/1.3 system-ui,sans-serif;cursor:pointer;
      transition:filter .1s
    }
    .mm-pick-menu button:hover{filter:brightness(.92)}
    .mm-pick-origin{background:var(--color-chip-bg,#e8edf3);color:var(--color-chip-text,#0f172a)}
    .mm-pick-dest{background:var(--color-accent,#2563eb);color:#fff}
  `
  document.head.appendChild(s)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  injectKeyframes()
  injectPickMenuStyle()

  // Resolve tile source before creating the map so the correct URL/key
  // is set from the first frame — avoids a style reload after mount.
  activeTileUrl = await resolveTileUrl()

  const cityCenter = city.activeCity.center
  const initialCenter: [number, number] = props.center ?? props.from ?? [cityCenter.lat, cityCenter.lon]

  // Search mode starts at zoom 14 so bus stops are visible within the
  // 1.5 km nearby-stops radius — same zoom the GeolocateControl targets.
  // Stop mode starts at zoom 15 (street level) so nearby-stop dots are
  // visibly separated from the main marker - render()'s "only zoom in when
  // panning to a point outside the current viewport" guard never fires on
  // the initial mount, since props.center is already the map's own initial
  // center (trivially "contained"), so it can't be relied on to zoom in here.
  const initialZoom = props.mode === 'search' ? 14 : props.mode === 'stop' ? 15 : 13

  map = new maplibregl.Map({
    container: mapEl.value!,
    style: buildMapStyle(activeTileUrl) as StyleSpecification,
    center: toLngLat(initialCenter),
    zoom: initialZoom,
    minZoom: 8,
    attributionControl: false,
    // Disable unnecessary controls
    boxZoom: false,
    doubleClickZoom: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
  })

  // All modes: zoom controls + scale bar at consistent positions.
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')

  // All modes: geolocation button. search + network also emit events to the
  // parent so the rest of the app can react to the user's position.
  geoCtrl = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    // Cap at zoom 14 in search/network modes so the 1.5 km nearby radius
    // (nearby stops in search mode, LinesView's "near me" filter in
    // network mode) stays visible instead of the library's own default,
    // which zooms in tighter than that.
    ...(props.mode === 'search' || props.mode === 'network' ? { fitBoundsOptions: { maxZoom: 14 } } : {}),
  })
  if (props.mode === 'search' || props.mode === 'network') {
    geoCtrl.on('geolocate', (e) => {
      emit('geolocate', { lat: e.coords.latitude, lon: e.coords.longitude })
    })
    geoCtrl.on('error', (e) => {
      emit('geolocate-error', { code: e.code })
    })
  }
  map.addControl(geoCtrl, 'top-right')
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

  // Right-click (desktop): show pick menu at the clicked coordinate.
  map.on('contextmenu', (e) => {
    e.originalEvent?.preventDefault()
    showPickMenu(e.lngLat.lng, e.lngLat.lat)
  })

  // Long-press (mobile): same action.
  mapCanvasEl = map.getCanvas()
  mapCanvasEl.addEventListener('touchstart', onTouchStart, { passive: true })
  mapCanvasEl.addEventListener('touchmove',  onTouchMove,  { passive: true })
  mapCanvasEl.addEventListener('touchend',   onTouchEnd,   { passive: true })
  mapCanvasEl.addEventListener('touchcancel', onTouchEnd,  { passive: true })

  // loadBusStopIcon must finish before initOverlayLayers() so the image is
  // already registered when the symbol layer that references it is added.
  // setStyle() clears custom images, so we re-load on style.load too.
  map.on('load', async () => {
    styleReady = true
    await Promise.all([loadBusStopIcon(), loadNearbyStopIcon()])
    initOverlayLayers()
    render()
  })

  map.on('style.load', async () => {
    styleReady = true
    await Promise.all([loadBusStopIcon(), loadNearbyStopIcon()])
    initOverlayLayers()
    render()
  })

  map.on('zoomend', renderStops)

  map.on('webglcontextlost', () => {
    console.warn('[MiniMap] WebGL context lost')
    styleReady = false
  })
  map.on('webglcontextrestored', async () => {
    styleReady = true
    await Promise.all([loadBusStopIcon(), loadNearbyStopIcon()])
    initOverlayLayers()
    render()
  })
})

onUnmounted(() => {
  if (mapCanvasEl) {
    mapCanvasEl.removeEventListener('touchstart', onTouchStart)
    mapCanvasEl.removeEventListener('touchmove',  onTouchMove)
    mapCanvasEl.removeEventListener('touchend',   onTouchEnd)
    mapCanvasEl.removeEventListener('touchcancel', onTouchEnd)
    mapCanvasEl = null
  }
  pickPopup?.remove()
  pickPopup = null
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
  if (map) {
    map.remove()
    map = null
    styleReady = false
  }
  geoCtrl = null
})

watch(
  () => [
    props.mode, props.center, props.from, props.to,
    props.routeLegs, props.stops, props.highlightedKey,
    props.userPosition, props.pickedPoint,
  ],
  () => { if (styleReady) render() },
  { deep: true },
)

// Deliberately its own watcher, not folded into the one above - see
// selectedStopId's prop doc comment for why it must not go through the
// full render() (route mode's unconditional fitBounds would yank the
// camera back to the whole route on every stop selection).
watch(
  () => props.selectedStopId,
  () => { if (styleReady) updateSelectedStopMarker() },
)

watch(
  () => theme.isDark,
  () => {
    if (!map) return
    // setStyle replaces all layers/sources; 'style.load' re-adds overlay layers.
    // theme.apply() has already updated the data-theme attribute by the time
    // this runs (synchronous in the store action, this watcher fires after),
    // so buildMapStyle's getComputedStyle read picks up the new theme's colors.
    styleReady = false
    map.setStyle(buildMapStyle(activeTileUrl) as StyleSpecification)
  },
)

watch(
  () => city.activeSlug,
  async () => {
    if (!map) return
    const c = city.activeCity.center
    // Center on the newly selected city immediately (before tiles load).
    map.setCenter([c.lon, c.lat])
    map.setZoom(12)
    // Reload tile source for the new city (different pmtiles URL or offline blob).
    const newTileUrl = await resolveTileUrl()
    if (newTileUrl !== activeTileUrl) {
      activeTileUrl = newTileUrl
      styleReady = false
      map.setStyle(buildMapStyle(activeTileUrl) as StyleSpecification)
    }
  },
)

// Programmatically fires the same native geolocate button already sitting
// in the map's own corner (top-right GeolocateControl) - lets a parent
// build its own trigger (e.g. LinesView's "near me" button) without
// duplicating the control's own geolocation call, camera framing, and
// "you are here" dot. Returns whether the request could be started (false
// if the control isn't ready yet or geolocation is unsupported) - the
// caller still gets its result via the existing geolocate/geolocate-error
// events, this only starts the request.
function triggerGeolocate(): boolean {
  return geoCtrl?.trigger() ?? false
}

// Eases back to the city-wide overview - the same fallback view render()
// already falls through to in network mode when nothing is highlighted.
// Triggering geolocation only ever moves the camera towards the user; this
// is the way back out (LinesView's "near me" button doubles as this once
// active), since there's no prop-driven path for it anymore.
function resetView(): void {
  if (!map) return
  const c = city.activeCity.center
  map.easeTo({ center: [c.lon, c.lat], zoom: 12, duration: 350 })
}

defineExpose({ triggerGeolocate, resetView })
</script>

<template>
  <div class="map-root" :class="{ dark: theme.isDark }">
    <div ref="mapEl" class="map-host" />
  </div>
</template>

<style scoped>
.map-root {
  position: relative;
  width: 100%;
  height: 100%;
  /* Clip MapLibre's canvas to the component bounds */
  overflow: hidden;
}

.map-host {
  width: 100%;
  height: 100%;
}

/* Push top-right controls below the notch (env) + any per-screen overlay
   (--map-ctrl-top-extra, set by the parent via inline style on <MiniMap>). */
.map-host :deep(.maplibregl-ctrl-top-right) {
  padding-top: calc(env(safe-area-inset-top, 0px) + var(--map-ctrl-top-extra, 8px));
}
</style>

