/**
 * Coordinate and bounds helpers for MiniMap.
 *
 * Our data uses [lat, lon] arrays (OTP / Leaflet convention).
 * MapLibre and GeoJSON use [lon, lat]. Always convert at the boundary.
 */
import { latLonBounds } from '@/services/geo'
import type { MapLeg, Route, RouteDirection } from '@/types'

export type LatLon = [number, number]

export const toLngLat = ([lat, lon]: LatLon): [number, number] => [lon, lat]

export function pointsToCoords(points: LatLon[]): [number, number][] {
  return points.map(toLngLat)
}

/** Returns MapLibre LngLatBoundsLike: [[minLon, minLat], [maxLon, maxLat]] */
export function latLonArrayToBounds(points: LatLon[]): [[number, number], [number, number]] {
  const { minLat, maxLat, minLon, maxLon } = latLonBounds(points)
  return [[minLon, minLat], [maxLon, maxLat]]
}

/** The base MapLeg shape every "draw this line on the map" call site needs
 * (route id + one direction's own points) - callers add their own extras
 * (dashed, key, ...) with a spread where needed. */
export function toMapLeg(
  route: Pick<Route, 'shortName' | 'agencyId'>,
  dir: Pick<RouteDirection, 'points'>,
): MapLeg {
  return {
    mode: 'BUS',
    points: dir.points,
    routeShortName: route.shortName,
    routeAgencyId: route.agencyId,
  }
}

/**
 * Reads a color custom property live (theme.css/tokens.css) - for contexts
 * that need a literal string (canvas fillStyle, MapLibre GL paint
 * properties, marker element.style assignments), not a CSS var() the
 * browser can re-resolve on its own on a theme change.
 */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
