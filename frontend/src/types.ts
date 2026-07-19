// ── City data ──────────────────────────────────────────────────────────────

export interface Stop {
  id: string
  name: string
  lat: number
  lon: number
}

export type PoiType =
  | 'hospital' | 'clinic'
  | 'marketplace' | 'university' | 'neighbourhood' | 'transit'
  | 'bank' | 'pharmacy' | 'school' | 'fuel' | 'police' | 'fire_station'
  | 'post_office' | 'library' | 'cinema' | 'theatre' | 'stadium' | 'leisure'
  | 'social' | 'hotel' | 'museum' | 'attraction' | 'park'
  | 'food' | 'health' | 'worship' | 'service' | 'shop' | 'office'

export interface Poi {
  id: string
  name: string
  lat: number
  lon: number
  type: PoiType
  tier: 1 | 2 | 3
}

// ── Search ─────────────────────────────────────────────────────────────────

export type SearchResultSource = 'stop' | 'poi' | 'place'
export type SearchResultIcon =
  | 'stop' | 'hospital' | 'marketplace' | 'university' | 'neighbourhood'
  | 'transit' | 'bank' | 'pharmacy' | 'hotel' | 'food' | 'shop' | 'place'

export interface SearchResult {
  id: string
  name: string
  sub: string
  lat: number
  lon: number
  source: SearchResultSource
  icon: SearchResultIcon
}

// ── Itinerary / routing ────────────────────────────────────────────────────

export type LegMode = 'WALK' | 'BUS'

export interface LegEndpoint {
  name: string
  lat: number | null
  lon: number | null
}

export interface WalkLeg {
  mode: 'WALK'
  duration: number
  from: LegEndpoint
  to: LegEndpoint
  startTime?: number
  endTime?: number
}

export interface BusLeg {
  mode: 'BUS'
  duration: number
  route: { shortName: string }
  agency: { gtfsId: string | null; name: string | null }
  from: LegEndpoint
  to: LegEndpoint
  startTime: number
  endTime: number
  headsign: string
}

export type Leg = WalkLeg | BusLeg

export interface Itinerary {
  duration: number
  numberOfTransfers: number
  waitingTime: number
  legs: Leg[]
  mapLegs?: MapLeg[]
}

// ── Map legs (MiniMap geometry) ────────────────────────────────────────────

export interface MapLeg {
  mode: LegMode
  points: [number, number][]
  routeShortName: string | null
  routeAgencyId: string | null
  key?: string
  // Network mode only: a secondary destination variant of an already-drawn
  // line (e.g. a branching line's other termini), shown dashed and only
  // when that line is the highlighted one - see LinesView.vue.
  dashed?: boolean
}

// ── Frequency / reliability ────────────────────────────────────────────────

export type Reliability = 'high' | 'medium' | 'low'

// ── Routes ────────────────────────────────────────────────────────────────

export type RouteStop = Stop

export interface RouteDirection {
  headsign?: string
  stops: RouteStop[]
  points: [number, number][]
  // Other shape_id variants sharing this same headsign (e.g. minor path
  // deviations too small to deserve their own destination chip) - drawn
  // dashed in LineView so every stop in `stops` has a nearby visible line,
  // not one stranded off the single primary path. Absent in routes-meta.json
  // (geometry, stripped like `points` - see gtfs_routes_to_json.py).
  extraPaths?: [number, number][][]
  // Real per-line headway, computed from the timetable itself (see
  // pipeline/gtfs_routes_to_json.py::compute_frequency_periods) - only
  // covers bands with enough data, so lookups fall back to the city's
  // generic Schedule.frequencyPeriods when a band is missing here.
  frequencyPeriods?: FrequencyPeriod[]
  // Whether this direction has real per-trip departure times (vs. a
  // published frequencies.txt band) - independent of the city's
  // transitSource, since a single official-gtfs feed can freely mix
  // schedule-based and frequency-based directions. Optional only for
  // data generated before this field existed - treat missing as false
  // (assume estimated, the conservative default) at the call site.
  hasFixedSchedule?: boolean
}

// Mirrors pipeline/gtfs_routes_to_json.py's GTFS_MODES - GTFS route_type
// mapped to a stable string. Every route has one; unrecognized/extended
// GTFS route_type codes fall back to 'bus' on the pipeline side rather
// than being a distinct value here.
export type TransitMode =
  | 'tram' | 'metro' | 'rail' | 'bus' | 'ferry'
  | 'cable_tram' | 'aerial_lift' | 'funicular' | 'trolleybus' | 'monorail'

export interface Route {
  shortName: string
  longName: string
  agencyId: string
  agencyName: string
  // Optional only for data generated before this field existed (same
  // reasoning as RouteDirection.hasFixedSchedule) - treat missing as 'bus'
  // at the call site, the pipeline's own fallback for an unrecognized
  // GTFS route_type.
  mode?: TransitMode
  // Official route_color/route_text_color from the source GTFS, if the feed
  // set them (osm_to_gtfs.py's synthetic feeds never do). Only actually
  // used for display when the active city opts in - see
  // CityConfigRaw.useOfficialLineColors and useLineColor.ts.
  color?: string
  textColor?: string
  directions: RouteDirection[]
}

// ── Nearby stops (with computed distance) ─────────────────────────────────

export interface StopWithDistance extends Stop {
  distanceMeters: number
  lines?: string[]
}

// ── Stop detail (StopView) ─────────────────────────────────────────────────

export interface StopLine {
  shortName: string
  longName: string
  headsign?: string
  agencyId: string | null
  agencyName: string | null
  headwayMin: number | null
  reliability: Reliability | null
  // See RouteDirection.hasFixedSchedule.
  hasFixedSchedule: boolean
}

export interface NearbyStop {
  id: string
  name: string
  lat: number
  lon: number
  distanceM: number
  walkMin: number
}

export interface StopDetail {
  stop: Stop
  lines: StopLine[]
  nearbyStops: NearbyStop[]
}

// ── Geo positions ─────────────────────────────────────────────────────────

export interface GeoPosition {
  lat: number
  lon: number
}

export interface NamedPosition extends GeoPosition {
  name: string
}

export interface BoundingBox {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

// ── City config ────────────────────────────────────────────────────────────

export interface FrequencyPeriod {
  start: string           // "HH:MM:SS"
  end: string
  headwaySeconds: number
  reliability: Reliability
}

export interface Schedule {
  serviceStart: string    // "HH:MM:SS"
  serviceEnd: string
  frequencyPeriods: FrequencyPeriod[]
}

export interface Agency {
  agencyId: string
  agencyName: string
  agencyUrl: string
  agencyTimezone: string
  agencyLang: string
}

export interface OsmPatches {
  areaName: string
  duplicateRelationIds?: number[]
  refAliases?: Record<string, string>
}

export interface TransitSource {
  type: 'official-gtfs'
  url: string
}

export interface CityConfigRaw {
  slug: string
  country: string
  displayName: string
  feedId: string
  center: GeoPosition
  nearbyRadiusMeters: number
  searchBbox: BoundingBox
  tileBbox: BoundingBox
  tileMinzoom: number
  offlineMb: number
  agencies: Agency[]
  defaultAgencyId: string
  operatorAliases: Record<string, string>
  schedule: Schedule
  osmPatches: OsmPatches
  // Absent for OSM-synthetic cities (schedule is a hand-tuned frequency
  // estimate, no real published timetable to compare against). See
  // stores/city.ts's hasOfficialSchedule getter.
  transitSource?: TransitSource
  // Opt-in: use each line's own GTFS route_color/route_text_color (see
  // Route.color/textColor) instead of the hash-based palette in
  // useLineColor.ts. Off by default - only meaningful for official-gtfs
  // cities, and even then a per-city choice, not forced on every one.
  useOfficialLineColors?: boolean
}

export interface CountryConfig {
  displayName: string
  countryCode: string
}

export interface CityConfig extends CityConfigRaw {
  countryCode: string
}

// ── Routing params ─────────────────────────────────────────────────────────

export interface RoutingParams {
  fromLat: number
  fromLon: number
  toLat: number
  toLon: number
  time: string
  fromName?: string | null
  toName?: string | null
}
