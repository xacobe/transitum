<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import type { StyleSpecification } from 'maplibre-gl'
import type { Feature, Point } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useOfflineTiles } from '@/composables/useOfflineTiles'

// Set once when this chunk is first loaded (before any map instance is created).
// Kept here rather than main.ts so maplibre-gl stays in the lazy MiniMap chunk
// and is not pulled into the main bundle.
;(maplibregl as typeof maplibregl & { workerCount: number }).workerCount = 1
import { useThemeStore } from '@/stores/theme'
import { useCityStore } from '@/stores/city'
import { useLineColor } from '@/composables/useLineColor'
import { buildMapStyle } from '@/map/style'
import { type LatLon, toLngLat, pointsToCoords, latLonArrayToBounds, cssVar } from '@/map/geometry'
import { resolveTileUrl } from '@/map/tileSource'
import { drawStopIcon, modeColor } from '@/map/stopIcon'
import { pickStopIconMode } from '@/services/modeIconSvg'
import {
  pulsingDotElement, pinElement, solidDotElement, originFlagElement, busStopElement,
  pickMenuElement, injectMarkerStyles,
} from '@/map/markerElements'
import {
  ROUTE_SOURCE, STOPS_SOURCE, STOPS_MAP_SOURCE, NEARBY_STOPS_SOURCE,
  NEARBY_STOP_IMG, stopIconImg,
  initOverlayLayers, registerOverlayHandlers,
} from '@/map/overlayLayers'
import type { MapLeg, TransitMode } from '@/types'

// Every TransitMode gets its own map sprite (see loadStopIcons/stopIconImg) -
// listed once here since TransitMode itself is a type, not a runtime value.
const ALL_TRANSIT_MODES: TransitMode[] = [
  'tram', 'metro', 'rail', 'bus', 'ferry',
  'cable_tram', 'aerial_lift', 'funicular', 'trolleybus', 'monorail',
]

type Anchor = 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const props = withDefaults(defineProps<{
  mode: 'search' | 'route' | 'stop' | 'network'
  center?: [number, number]
  from?: [number, number]
  to?: [number, number]
  routeLegs?: MapLeg[]
  stops?: { id?: string; name?: string; lat: number; lon: number; modes?: TransitMode[] }[]
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
let styleReady = false
let markers: maplibregl.Marker[] = []
// Kept separate from `markers` (which the main render() cycle bulk-clears
// on every call) - see selectedStopId's own doc comment for why this has
// its own lightweight update path instead.
let selectedStopMarker: maplibregl.Marker | null = null
// Stop mode: coordinate key of the stop last framed by render() - see its
// "Stop mode" branch below.
let lastStopFocusKey: string | null = null

// Context-menu popup (right-click / long-press to pick origin or destination)
let pickPopup: maplibregl.Popup | null = null
// Long-press state (mobile)
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let mapCanvasEl: HTMLCanvasElement | null = null

// Resolved once on mount (offline Blob key or remote URL, see map/tileSource).
let activeTileUrl = ''

const stopColor = () => cssVar('--color-stop-dot')

// ── Overlay sprites ────────────────────────────────────────────────────────
// One canvas sprite per TransitMode, all the symbol layers reference some of
// them. Must be registered before initOverlayLayers(); re-registered after
// setStyle() which clears all custom images. A module-level promise prevents
// double-registration when 'load' and 'style.load' fire close together on
// initial mount.
let stopIconsPromise: Promise<void> | null = null

async function loadStopIcons() {
  if (!map) return
  if (map.hasImage(stopIconImg('bus'))) return
  if (stopIconsPromise) { await stopIconsPromise; return }

  stopIconsPromise = (async () => {
    // 2× canvas for crisp rendering on retina displays. Each mode gets its
    // own identity color (see map/stopIcon.ts's MODE_COLOR_VAR /
    // styles/tokens.css's --color-mode-*) so bus/metro/tram/... stops are
    // visually distinguishable at a glance in search mode.
    await Promise.all(ALL_TRANSIT_MODES.map(async (mode) => {
      const imageData = await drawStopIcon(68, modeColor(mode), 4, mode)  // logical 34px × 2
      if (map && !map.hasImage(stopIconImg(mode))) {
        map.addImage(stopIconImg(mode), imageData, { pixelRatio: 2 })
      }
    }))
  })()

  await stopIconsPromise
  stopIconsPromise = null
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

// ── Overlay source data ────────────────────────────────────────────────────
function setSourceData(sourceId: string, features: Feature[]) {
  if (!map || !styleReady) return
  const source = map.getSource(sourceId) as GeoJSONSource | undefined
  source?.setData({ type: 'FeatureCollection', features })
}

function toStopFeature(
  s: { id?: string; name?: string; lat: number; lon: number; modes?: TransitMode[] },
  color: string,
  extra: Record<string, string | number> = {},
): Feature<Point> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    properties: {
      id: s.id ?? '', name: s.name ?? '', lat: s.lat, lon: s.lon, color,
      // Only STOPS_POINT_LAYER (search mode) actually reads 'icon' - harmless
      // on the other sources' circle-type layers, which ignore it.
      icon: stopIconImg(pickStopIconMode(s.modes)),
      ...extra,
    },
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
  // Endpoints keep their HTML markers (pulsing dot + pin from renderFromTo).
  if (props.mode === 'route') {
    const color = stopDotColor().bg
    const n = props.stops.length
    setSourceData(STOPS_SOURCE,
      props.stops
        .filter((_, i) => i !== 0 && i !== n - 1)
        .map((s, i) => toStopFeature(s, color, { seq: String(i + 2) })),
    )
    setSourceData(STOPS_MAP_SOURCE, [])
    return
  }

  // network mode: highlighted line stops as unclustered GL circles.
  if (props.mode === 'network') {
    const color = stopDotColor().bg
    setSourceData(STOPS_SOURCE, props.stops.map((s) => toStopFeature(s, color)))
    setSourceData(STOPS_MAP_SOURCE, [])
    return
  }

  // search mode: all city stops via the clustered GL source.
  // Clustering is handled natively by MapLibre — no per-feature JS needed.
  if (props.mode === 'search') {
    setSourceData(STOPS_SOURCE, [])
    setSourceData(STOPS_MAP_SOURCE, props.stops.map((s) => toStopFeature(s, stopColor())))
    return
  }

  // stop mode: the current stop is the single HTML marker already placed by
  // renderFromTo(); nearby stops (props.stops, if passed) are small muted
  // bus-stop icons (see overlayLayers) - a quick spatial hint, not meant to
  // compete with the main marker.
  if (props.mode === 'stop') {
    setSourceData(NEARBY_STOPS_SOURCE, props.stops.map((s) => toStopFeature(s, '')))
    setSourceData(STOPS_SOURCE, [])
    setSourceData(STOPS_MAP_SOURCE, [])
    return
  }

  setSourceData(NEARBY_STOPS_SOURCE, [])
  setSourceData(STOPS_SOURCE, [])
  setSourceData(STOPS_MAP_SOURCE, [])
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

  const el = pulsingDotElement(stopDotColor().bg, 26, {
    ringInset: '-10px', duration: '1.8s', shadow: '0 2px 8px rgba(0,0,0,.4)',
  })
  selectedStopMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
    .setLngLat(toLngLat([stop.lat, stop.lon]))
    .addTo(map)
}

// ── From / To markers ──────────────────────────────────────────────────────
function renderFromTo() {
  const accent = cssVar('--color-accent')
  const pin    = cssVar('--color-map-pin')

  if (props.mode === 'route' && props.from && props.to) {
    addMarker(solidDotElement(accent), toLngLat(props.from), 'center')
    addMarker(pinElement(pin), toLngLat(props.to), 'bottom')
  } else if (props.mode === 'stop' && props.center) {
    addMarker(busStopElement(stopColor(), () => {}), toLngLat(props.center), 'center')
  } else if (props.mode === 'search') {
    // Flag for an origin the user explicitly picked on the map.
    if (props.pickedPoint) {
      addMarker(originFlagElement(accent), toLngLat([props.pickedPoint.lat, props.pickedPoint.lon]), 'center')
    }
  }

  // All modes: pulse marker for the user's actual GPS position.
  if (props.userPosition) {
    addMarker(pulsingDotElement(accent, 18), toLngLat(props.userPosition), 'center')
  }
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
      .map((leg): Feature => {
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

    setSourceData(ROUTE_SOURCE, features)

    const bounds = latLonArrayToBounds(
      [props.from!, props.to!, ...legs.flatMap(l => l.points)]
    )
    map.fitBounds(bounds, { animate: false, padding: 30 })

  // ── Network mode ──────────────────────────────────────────────────────────
  } else if (props.mode === 'network') {
    const highlightedPts: LatLon[] = []

    const ordered = [...props.routeLegs].sort((a, b) =>
      a.key === props.highlightedKey ? 1 : b.key === props.highlightedKey ? -1 : 0
    )

    const features = ordered
      .filter(leg => leg.points?.length > 0)
      .map((leg): Feature => {
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

    setSourceData(ROUTE_SOURCE, features)

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

  // ── Stop mode ──────────────────────────────────────────────────────────────
  // Always frame the specific stop, once its coordinates are known. Unlike
  // search mode below, there's no "don't move if already visible" case worth
  // optimizing for here: props.center starts undefined (stop data loads
  // async after mount) and by the time it resolves, the city-overview
  // fallback view already "contains" it at zoom 12 - the search mode
  // viewport check would silently never zoom to the actual stop.
  } else if (props.mode === 'stop') {
    setSourceData(ROUTE_SOURCE, [])
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

  // ── Search mode ────────────────────────────────────────────────────────────
  } else {
    setSourceData(ROUTE_SOURCE, [])
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
  }

  renderStops()
  updateSelectedStopMarker()
}

// ── Pick-location context menu ────────────────────────────────────────────
// Opens a small floating popup at the tapped coordinates with two actions.
// CSS for the popup content is injected once (see injectMarkerStyles).
function showPickMenu(lng: number, lat: number) {
  if (!map || !props.pickMenu) return
  pickPopup?.remove()

  const wrap = pickMenuElement(
    t('home.useAsOrigin'),      () => emit('pick-origin',      { lat, lon: lng }),
    t('home.useAsDestination'), () => emit('pick-destination', { lat, lon: lng }),
    () => { pickPopup?.remove(); pickPopup = null },
  )

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

// ── Lifecycle ──────────────────────────────────────────────────────────────
// Overlay event handlers must be registered exactly once per map instance -
// they survive setStyle(), unlike sources/layers/images (see overlayLayers).
let overlayHandlersRegistered = false

async function onStyleReady() {
  if (!map) return
  styleReady = true
  await Promise.all([loadStopIcons(), loadNearbyStopIcon()])
  // Clusters mix stops of potentially several modes, so they use the app's
  // general accent color rather than any one mode's color.
  initOverlayLayers(map, cssVar('--color-accent'))
  if (!overlayHandlersRegistered) {
    overlayHandlersRegistered = true
    registerOverlayHandlers(map, (stop) => emit('stop-click', stop))
  }
  render()
}

onMounted(async () => {
  injectMarkerStyles()

  // Resolve tile source before creating the map so the correct URL/key
  // is set from the first frame — avoids a style reload after mount.
  activeTileUrl = await resolveTileUrl(city.activeCity.slug, getOfflineBlob)

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

  // The sprites must be registered before initOverlayLayers() so the symbol
  // layers can reference them (onStyleReady handles the ordering).
  // setStyle() clears sources/layers/images, so 'style.load' re-runs it too.
  map.on('load', onStyleReady)
  map.on('style.load', onStyleReady)

  map.on('zoomend', renderStops)

  map.on('webglcontextlost', () => {
    console.warn('[MiniMap] WebGL context lost')
    styleReady = false
  })
  map.on('webglcontextrestored', onStyleReady)
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
    const newTileUrl = await resolveTileUrl(city.activeCity.slug, getOfflineBlob)
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
