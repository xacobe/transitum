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
import { type LatLon, toLngLat, pointsToCoords, latLonArrayToBounds, paddedMaxBounds, cssVar } from '@/map/geometry'
import { resolveTileUrl } from '@/map/tileSource'
import { drawStopIcon, drawHeadingCone, drawPin, drawFlagIcon, modeColor } from '@/map/stopIcon'
import { pickStopIconMode } from '@/services/modeIconSvg'
import { pickMenuElement, injectPickMenuStyles } from '@/map/markerElements'
import {
  ROUTE_SOURCE, ROUTE_FROM_SOURCE, ROUTE_TO_SOURCE, ROUTE_TO_PIN_IMG,
  STOPS_SOURCE, STOPS_MAP_SOURCE, STOPS_NETWORK_SOURCE, STOPS_SELECTED_SOURCE,
  CURRENT_STOP_SOURCE, NEARBY_STOPS_SOURCE, NEARBY_STOP_IMG, stopIconImg,
  ORIGIN_FLAG_SOURCE, ORIGIN_FLAG_IMG,
  USER_LOCATION_SOURCE, USER_LOCATION_CONE_IMG,
  initOverlayLayers, registerOverlayHandlers,
} from '@/map/overlayLayers'
import type { MapLeg, TransitMode } from '@/types'

// Every TransitMode gets its own map sprite (see loadStopIcons/stopIconImg) -
// listed once here since TransitMode itself is a type, not a runtime value.
const ALL_TRANSIT_MODES: TransitMode[] = [
  'tram', 'metro', 'rail', 'bus', 'ferry',
  'cable_tram', 'aerial_lift', 'funicular', 'trolleybus', 'monorail',
]

const props = withDefaults(defineProps<{
  mode: 'search' | 'route' | 'stop' | 'network'
  center?: [number, number]
  from?: [number, number]
  to?: [number, number]
  routeLegs?: MapLeg[]
  stops?: { id?: string; name?: string; lat: number; lon: number; modes?: TransitMode[] }[]
  /** Network mode: every stop in the city, drawn as a clustered background
   * layer (same clustering as search mode) beneath the highlighted line's
   * own stops (`stops` above) - see renderStops()'s network branch. */
  cityStops?: { id?: string; name?: string; lat: number; lon: number; modes?: TransitMode[] }[]
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
  /** Device compass heading in degrees (0 = north, clockwise) → direction
   * cone behind the GPS dot, same as the marker itself: own lightweight
   * update path below, not the main render() cycle (see
   * updateUserLocationMarker's doc comment) - orientation events can fire
   * many times a second. */
  headingDeg?: number | null
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
  cityStops: () => [],
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
// GPS "you are here" marker: a GL layer (see overlayLayers.ts's
// USER_LOCATION_SOURCE), not an HTML marker - continuously animated
// (pulsing ring) and rotated (heading cone) by rewriting this one
// feature's properties every frame instead of touching the DOM, since
// compass ticks (see the headingDeg watcher below) can fire many times a
// second. userLocationCoords/HeadingDeg are what the running pulse loop's
// own tick() reads each frame; updating them here doesn't restart the
// loop or touch the map directly.
let userLocationPulseFrame: number | null = null
let userLocationCoords: [number, number] | null = null // [lon, lat]
let userLocationHeadingDeg: number | null = null
// Stop mode: coordinate key of the stop last framed by render() - see its
// "Stop mode" branch below.
let lastStopFocusKey: string | null = null
// Search mode: key of the center render() last actually moved the camera
// to - see its "Search mode" branch below.
let lastSearchCenterKey: string | null = null
// Search mode: id of the stop the appear-burst animation last played for -
// see startSelectedStopHalo's own doc comment.
let lastSelectedStopKey: string | null = null

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

let routeToPinPromise: Promise<void> | null = null

async function loadRouteToPinIcon() {
  if (!map) return
  if (map.hasImage(ROUTE_TO_PIN_IMG)) return
  if (routeToPinPromise) { await routeToPinPromise; return }

  routeToPinPromise = (async () => {
    const imageData = drawPin(44, cssVar('--color-map-pin'))  // logical 22px × 2
    if (map && !map.hasImage(ROUTE_TO_PIN_IMG)) {
      map.addImage(ROUTE_TO_PIN_IMG, imageData, { pixelRatio: 2 })
    }
  })()

  await routeToPinPromise
  routeToPinPromise = null
}

let originFlagPromise: Promise<void> | null = null

async function loadOriginFlagIcon() {
  if (!map) return
  if (map.hasImage(ORIGIN_FLAG_IMG)) return
  if (originFlagPromise) { await originFlagPromise; return }

  originFlagPromise = (async () => {
    const imageData = await drawFlagIcon(68, cssVar('--color-accent'), 4)  // logical 34px × 2
    if (map && !map.hasImage(ORIGIN_FLAG_IMG)) {
      map.addImage(ORIGIN_FLAG_IMG, imageData, { pixelRatio: 2 })
    }
  })()

  await originFlagPromise
  originFlagPromise = null
}

let userLocationConePromise: Promise<void> | null = null

async function loadUserLocationConeIcon() {
  if (!map) return
  if (map.hasImage(USER_LOCATION_CONE_IMG)) return
  if (userLocationConePromise) { await userLocationConePromise; return }

  userLocationConePromise = (async () => {
    const imageData = drawHeadingCone(180, cssVar('--color-accent'))
    if (map && !map.hasImage(USER_LOCATION_CONE_IMG)) {
      map.addImage(USER_LOCATION_CONE_IMG, imageData, { pixelRatio: 2 })
    }
  })()

  await userLocationConePromise
  userLocationConePromise = null
}

// ── Overlay source data ────────────────────────────────────────────────────
function setSourceData(sourceId: string, features: Feature[]) {
  if (!map || !styleReady) return
  const source = map.getSource(sourceId) as GeoJSONSource | undefined
  source?.setData({ type: 'FeatureCollection', features })
}

/** Plain point feature, no properties - for GL layers with fixed paint/layout
 * (route mode's from/to endpoints), unlike toStopFeature's per-feature ones. */
function pointFeature(point: LatLon): Feature<Point> {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: toLngLat(point) }, properties: {} }
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
      // Only the icon symbol layers (STOPS_POINT_LAYER/STOPS_NETWORK_LAYER)
      // actually read 'icon'/'selected'/'anySelected' - harmless on the
      // other sources' circle-type layers, which ignore them.
      icon: stopIconImg(pickStopIconMode(s.modes)),
      selected: s.id != null && s.id === props.selectedStopId ? 1 : 0,
      anySelected: props.selectedStopId ? 1 : 0,
      ...extra,
    },
  }
}

// Plain, undimmed route-line features - shared by stop mode (the expanded
// line's own drawing on StopView's map) and search mode (a stop's serving
// lines on HomeView's map, see its selectedStopLegs). Neither ever draws
// more than a handful of legs at once, so no dimming/highlight logic is
// needed the way route/network mode's own feature-building has.
function simpleRouteFeatures(legs: MapLeg[]): Feature[] {
  return legs
    .filter((leg) => leg.points.length > 0)
    .map((leg): Feature => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: pointsToCoords(leg.points) },
      properties: {
        color: colorFor(leg.routeShortName ?? '', leg.routeAgencyId).bg,
        opacity: 0.85,
        weight: 5,
        walk: false,
        dashed: false,
      },
    }))
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
// Every mode clears the stop sources it doesn't use and populates the ones
// it does - building the full set here (defaulted empty) and writing it out
// in one loop means a mode branch only ever states what it actually draws,
// and a future stop source needs one new default entry, not a new line in
// every existing branch.
function renderStops() {
  if (!map || !styleReady) return

  const sources: Record<string, Feature[]> = {
    [STOPS_SOURCE]: [],
    [STOPS_MAP_SOURCE]: [],
    [STOPS_NETWORK_SOURCE]: [],
    [CURRENT_STOP_SOURCE]: [],
    [NEARBY_STOPS_SOURCE]: [],
    [ROUTE_FROM_SOURCE]: [],
    [ROUTE_TO_SOURCE]: [],
    [ORIGIN_FLAG_SOURCE]: [],
  }

  if (props.mode === 'route') {
    // Intermediate stops as unclustered GL circles + sequence numbers.
    const color = stopDotColor().bg
    const n = props.stops.length
    sources[STOPS_SOURCE] = props.stops
      .filter((_, i) => i !== 0 && i !== n - 1)
      .map((s, i) => toStopFeature(s, color, { seq: String(i + 2) }))
    if (props.from && props.to) {
      sources[ROUTE_FROM_SOURCE] = [pointFeature(props.from)]
      sources[ROUTE_TO_SOURCE] = [pointFeature(props.to)]
    }
  } else if (props.mode === 'network') {
    // Highlighted line stops as unclustered GL circles, plus every city
    // stop as an unclustered background layer (STOPS_NETWORK_SOURCE, not
    // the clustered STOPS_MAP_SOURCE search mode uses) - invisible zoomed
    // out over most of the city, mode icons appear directly past its
    // minzoom, no cluster-bubble step in between (see overlayLayers.ts).
    const color = stopDotColor().bg
    sources[STOPS_SOURCE] = props.stops.map((s) => toStopFeature(s, color))
    sources[STOPS_NETWORK_SOURCE] = props.cityStops.map((s) => toStopFeature(s, stopColor()))
  } else if (props.mode === 'search') {
    // All city stops via the clustered GL source. Clustering is handled
    // natively by MapLibre — no per-feature JS needed.
    sources[STOPS_MAP_SOURCE] = props.stops.map((s) => toStopFeature(s, stopColor()))
    // Flag for an origin the user explicitly picked on the map.
    if (props.pickedPoint) {
      sources[ORIGIN_FLAG_SOURCE] = [pointFeature([props.pickedPoint.lat, props.pickedPoint.lon])]
    }
  } else if (props.mode === 'stop' && props.center) {
    // The current stop's own marker (CURRENT_STOP_SOURCE), plus nearby
    // stops (props.stops, if passed) as small muted bus-stop icons (see
    // overlayLayers) - a quick spatial hint, not meant to compete with the
    // main marker.
    sources[CURRENT_STOP_SOURCE] = [toStopFeature({ lat: props.center[0], lon: props.center[1] }, stopColor())]
    sources[NEARBY_STOPS_SOURCE] = props.stops.map((s) => toStopFeature(s, ''))
  }

  for (const [sourceId, features] of Object.entries(sources)) {
    setSourceData(sourceId, features)
  }
}

// Search mode: one-shot "appear" burst behind the selected stop's own icon
// (see STOPS_SELECTED_SOURCE's doc comment for why this is a GL layer, not
// an HTML marker) - plays once when a stop is newly selected, then clears
// itself, rather than pulsing indefinitely. The enlarge/dim treatment
// (toStopFeature's 'selected'/'anySelected', read by STOPS_POINT_LAYER) is
// the persistent indicator; this is just the entrance flourish. Driven by
// rewriting the source's one feature every frame - MapLibre has no native
// paint-property animation.
let selectedStopHaloFrame: number | null = null

function stopSelectedHalo() {
  if (selectedStopHaloFrame != null) {
    cancelAnimationFrame(selectedStopHaloFrame)
    selectedStopHaloFrame = null
  }
  setSourceData(STOPS_SELECTED_SOURCE, [])
}

// `icon` also feeds STOPS_SELECTED_ICON_LAYER's persistent enlarged icon
// (see overlayLayers.ts) - that one isn't animated, so once the burst
// finishes fading (opacity 0) the feature stays in the source rather than
// being cleared, keeping the enlarged icon visible for as long as this stop
// stays selected. stopSelectedHalo() (called from updateSelectedStopMarker
// when nothing - or a different stop - is selected) is what removes it.
function startSelectedStopHalo(stop: { id?: string; name?: string; lat: number; lon: number; modes?: TransitMode[] }) {
  if (selectedStopHaloFrame != null) cancelAnimationFrame(selectedStopHaloFrame)
  const color = stopDotColor().bg
  const icon = stopIconImg(pickStopIconMode(stop.modes))
  const durationMs = 500
  const minRadius = 10
  const maxRadius = 32
  const start = performance.now()

  function tick(now: number) {
    const t = Math.min((now - start) / durationMs, 1)
    const eased = 1 - (1 - t) * (1 - t) // ease-out
    const feature: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [stop.lon, stop.lat] },
      properties: {
        radius: minRadius + eased * (maxRadius - minRadius),
        opacity: 0.6 * (1 - eased),
        color, icon,
        // Same shape STOPS_POINT_LAYER's click handler reads (StopClickPayload) -
        // this layer sits on top of it and registers the same click handler.
        id: stop.id ?? '', name: stop.name ?? '', lat: stop.lat, lon: stop.lon,
      },
    }
    setSourceData(STOPS_SELECTED_SOURCE, [feature])
    selectedStopHaloFrame = t < 1 ? requestAnimationFrame(tick) : null
  }
  selectedStopHaloFrame = requestAnimationFrame(tick)
}

// One-shot burst (see startSelectedStopHalo) over whichever stop
// selectedStopId points at, in every mode - own update path, deliberately
// outside renderStops()/render() so selecting a stop never re-triggers
// route/network mode's unconditional fitBounds.
function updateSelectedStopMarker() {
  // Network mode's own `stops` prop is only ever the highlighted line's
  // stops (or empty) - a stop picked from the city-wide background layer
  // (cityStops) needs its own fallback lookup there.
  const stop = props.selectedStopId
    ? props.stops.find((s) => s.id === props.selectedStopId)
      ?? props.cityStops.find((s) => s.id === props.selectedStopId)
    : undefined
  if (!map || !styleReady || !stop) {
    lastSelectedStopKey = null
    stopSelectedHalo()
    return
  }

  // Every mode gets the same GL halo/enlarge treatment - route mode used
  // to be the one exception (its own HTML pulsingDotElement marker), but
  // stopDotColor() already resolves the right color for it (the active
  // route leg's own color), so there was no real reason for the split.
  // Only replay the burst when the selection actually changed - this runs
  // on every render() cycle (any prop change), not just an actual pick.
  if (props.selectedStopId !== lastSelectedStopKey) {
    lastSelectedStopKey = props.selectedStopId ?? null
    startSelectedStopHalo(stop)
  }
}

function stopUserLocationPulse() {
  if (userLocationPulseFrame != null) {
    cancelAnimationFrame(userLocationPulseFrame)
    userLocationPulseFrame = null
  }
  userLocationCoords = null
  setSourceData(USER_LOCATION_SOURCE, [])
}

// Runs forever (not a one-shot burst like startSelectedStopHalo) while a
// GPS position exists - rewrites the one feature's coordinates/heading
// every frame, so updateUserLocationMarker/the headingDeg watcher only
// ever need to update the plain userLocationCoords/HeadingDeg variables
// this reads, never touch the map directly or restart the loop.
function startUserLocationPulse() {
  if (userLocationPulseFrame != null) return // already running
  const durationMs = 2200
  const minRadius = 8
  const maxRadius = 22

  function tick(now: number) {
    if (!userLocationCoords) { userLocationPulseFrame = null; return }
    const t = (now % durationMs) / durationMs
    const feature: Feature<Point> = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: userLocationCoords },
      properties: {
        radius: minRadius + t * (maxRadius - minRadius),
        opacity: 0.35 * (1 - t),
        color: cssVar('--color-accent'),
        heading: userLocationHeadingDeg ?? 0,
        hasHeading: userLocationHeadingDeg != null ? 1 : 0,
      },
    }
    setSourceData(USER_LOCATION_SOURCE, [feature])
    userLocationPulseFrame = requestAnimationFrame(tick)
  }
  userLocationPulseFrame = requestAnimationFrame(tick)
}

function updateUserLocationMarker() {
  if (!map || !styleReady || !props.userPosition) {
    stopUserLocationPulse()
    return
  }
  userLocationCoords = toLngLat(props.userPosition)
  userLocationHeadingDeg = props.headingDeg ?? null
  startUserLocationPulse()
}

// ── Main render ────────────────────────────────────────────────────────────
function render() {
  if (!map || !styleReady) return

  map.resize() // recalculate viewport if container changed size

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
    // The expanded line's own drawing (see StopView's expandedLineLegs) -
    // empty (nothing drawn) whenever no line is expanded.
    setSourceData(ROUTE_SOURCE, simpleRouteFeatures(props.routeLegs))
    const c = city.activeCity.center
    // A stop picked from LineStopsAccordion's list, not from tapping the
    // map - unlike search/network mode's own selectedStopId (always a stop
    // already visible on screen, since that's how it got selected), this
    // one can be well outside the current view. Frame both this stop and
    // the one being viewed together instead of just drawing an (possibly
    // off-screen, so invisible) halo at its coordinates.
    const selected = props.selectedStopId
      ? props.stops.find((s) => s.id === props.selectedStopId)
      : undefined
    if (selected && props.center) {
      const key = `${props.center[0]},${props.center[1]}|${selected.id}`
      if (key !== lastStopFocusKey) {
        lastStopFocusKey = key
        map.fitBounds(
          latLonArrayToBounds([props.center, [selected.lat, selected.lon]]),
          { animate: false, padding: 60, maxZoom: 17 },
        )
      }
    } else if (props.center) {
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
    // Lines serving the currently previewed stop (see HomeView's
    // selectedStopLegs).
    setSourceData(ROUTE_SOURCE, simpleRouteFeatures(props.routeLegs))
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

    // Only move the camera when the origin (or the lack of one) actually
    // changed since the last render - render() re-runs on every prop change
    // (stops, routeLegs, ...), and without this guard any of those - e.g.
    // selecting a distant stop, which now draws its lines via routeLegs -
    // would snap the view back to the origin even though the user had
    // panned away on purpose to look at that stop.
    if (inActiveCity) {
      const key = `origin:${props.center![0]},${props.center![1]}`
      if (key !== lastSearchCenterKey) {
        lastSearchCenterKey = key
        const lngLat = toLngLat(props.center!)
        // Only pan/zoom when the new center is outside the current viewport.
        if (!map.getBounds().contains(lngLat)) {
          map.setCenter(lngLat)
          if (map.getZoom() < 14) map.setZoom(15)
        }
      }
    } else {
      // No center in the active city: show city overview zoom.
      const key = `city:${city.activeSlug}`
      if (key !== lastSearchCenterKey) {
        lastSearchCenterKey = key
        map.setCenter([c.lon, c.lat])
        map.setZoom(12)
      }
    }
  }

  renderStops()
  updateSelectedStopMarker()
  updateUserLocationMarker()
}

// ── Pick-location context menu ────────────────────────────────────────────
// Opens a small floating popup at the tapped coordinates with two actions.
// CSS for the popup content is injected once (see injectPickMenuStyles).
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
  await Promise.all([
    loadStopIcons(), loadNearbyStopIcon(), loadRouteToPinIcon(), loadOriginFlagIcon(), loadUserLocationConeIcon(),
  ])
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
  injectPickMenuStyles()

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
    // Keeps panning inside the city's own tile coverage (padded a bit, see
    // paddedMaxBounds) - past it there's nothing but blank basemap anyway.
    // Updated on city switch below, since the map instance itself persists
    // across those (setStyle/setCenter), not recreated.
    maxBounds: paddedMaxBounds(city.activeCity.tileBbox),
    // Smooths tile/layer transitions on zoom and style swaps (theme/city
    // switches) - purely cosmetic, negligible cost.
    fadeDuration: 300,
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
  // Network mode only: the one view where seeing many lines at once in a
  // small viewport actually benefits from going fullscreen.
  if (props.mode === 'network') {
    map.addControl(new maplibregl.FullscreenControl(), 'top-right')
  }

  // All modes: geolocation button. search + network also emit events to the
  // parent so the rest of the app can react to the user's position.
  geoCtrl = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    // We draw our own "you are here" dot (props.userPosition, see
    // updateUserLocationMarker) with its own heading cone - without this,
    // GeolocateControl's default showUserLocation:true also drew its own
    // native dot (class maplibregl-user-location-dot) at the same
    // coordinate, stacked invisibly behind/in front of ours. Also drops
    // showAccuracyCircle, which the type docs say is always off once this
    // is false - not worth a native circle just to keep it.
    showUserLocation: false,
    // Cap at zoom 14 in search/network modes so the 1.5 km nearby radius
    // (nearby stops in search mode, LinesView's "near me" filter in
    // network mode) stays visible instead of the library's own default,
    // which zooms in tighter than that.
    ...(props.mode === 'search' || props.mode === 'network' ? { fitBoundsOptions: { maxZoom: 14 } } : {}),
  })
  // Every mode forwards these, not just search/network: with
  // showUserLocation off, drawing the "you are here" marker at all now
  // depends entirely on the parent hearing this and passing a position
  // back in via userPosition - route/stop mode's geolocate button would
  // otherwise pan the camera there and show nothing.
  geoCtrl.on('geolocate', (e) => {
    emit('geolocate', { lat: e.coords.latitude, lon: e.coords.longitude })
  })
  geoCtrl.on('error', (e) => {
    emit('geolocate-error', { code: e.code })
  })
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
  if (selectedStopHaloFrame != null) { cancelAnimationFrame(selectedStopHaloFrame); selectedStopHaloFrame = null }
  if (userLocationPulseFrame != null) { cancelAnimationFrame(userLocationPulseFrame); userLocationPulseFrame = null }
  if (map) {
    map.remove()
    map = null
    styleReady = false
  }
  geoCtrl = null
})

// No `deep` - every one of these props is always reassigned wholesale by
// its caller (fresh computed(), never mutated in place - e.g. LinesView's
// filteredCityStops), so plain dependency tracking on each props.xxx
// access already re-runs this on every real change; `deep` would only add
// an O(n) traversal into props.stops/cityStops (network mode's city-wide
// background layer, easily 1,000+ stops) for no extra correctness.
// cityStops was briefly split into its own separate watch() to dodge that
// cost, but that meant two watch() registrations reacting to the same
// tick's change (e.g. LinesView's line-badge tap changes highlightedKey
// and filteredCityStops together) - two independent render() calls, not
// one. One watcher stays the right unit of work here.
watch(
  () => [
    props.mode, props.center, props.from, props.to,
    props.routeLegs, props.stops, props.cityStops, props.highlightedKey,
    props.userPosition, props.pickedPoint,
  ],
  () => { if (styleReady) render() },
)

// Deliberately its own watcher, not folded into the one above - see
// selectedStopId's prop doc comment for why it must not go through the
// full render() (route mode's unconditional fitBounds would yank the
// camera back to the whole route on every stop selection). renderStops()
// itself has no camera side effects (only setSourceData calls), so it's
// safe to call directly here - needed so the enlarge/dim treatment
// (toStopFeature's 'selected'/'anySelected') updates even on a render()
// cycle that wouldn't otherwise touch the stops sources.
watch(
  () => props.selectedStopId,
  () => { if (styleReady) { renderStops(); updateSelectedStopMarker() } },
)

// Compass ticks can fire many times a second - this only updates the
// variable startUserLocationPulse's already-running tick() reads each
// frame (see its own doc comment), never touches the map directly.
watch(
  () => props.headingDeg,
  (deg) => { userLocationHeadingDeg = deg ?? null },
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
    // Widen the pan limit to the new city's own extent *before* moving the
    // camera there - the old city's (likely non-overlapping) maxBounds
    // would otherwise clamp the upcoming setCenter right back into itself.
    map.setMaxBounds(paddedMaxBounds(city.activeCity.tileBbox))
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
