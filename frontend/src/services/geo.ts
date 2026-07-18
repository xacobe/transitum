export const WALK_MPS = 1.25

/** Min/max lat and lon across a set of [lat, lon] points - shared by
 * anything that needs to fit points into a viewport (MiniMap's MapLibre
 * bounds, an admin quality-check's inline SVG preview). */
export function latLonBounds(
  points: [number, number][],
): { minLat: number; maxLat: number; minLon: number; maxLon: number } {
  const lats = points.map(p => p[0])
  const lons = points.map(p => p[1])
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
  }
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r  = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a  = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(a))
}
