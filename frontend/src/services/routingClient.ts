import type { Itinerary, RoutingParams } from '@/types'

const ROUTING_ENDPOINT = import.meta.env.VITE_ROUTING_URL ?? '/routing/plan'
// Sibling endpoint under the same routing service - VITE_ROUTING_URL already
// points at .../routing/plan, so swap the last path segment.
const DEPARTURES_ENDPOINT = ROUTING_ENDPOINT.replace(/\/plan$/, '/departures')
const REQUEST_TIMEOUT_MS = 8000

// Shared request path for both routing endpoints: same timeout policy and
// the same body shape (either the payload or an { error } envelope).
async function requestJson<T>(input: string | URL, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`routing HTTP ${res.status}`)
  const json = await res.json() as T & { error?: string }
  if (json.error) throw new Error(json.error)
  return json
}

export function fetchRoutingPlan(
  params: RoutingParams & { citySlug: string },
): Promise<{ itineraries: Itinerary[] }> {
  return requestJson(ROUTING_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export function fetchStopDepartures(params: {
  citySlug: string
  stopId: string
  lines: string[]
  time: string
  maxCount?: number
}): Promise<{ departures: Record<string, string[]> }> {
  const url = new URL(DEPARTURES_ENDPOINT, window.location.origin)
  url.searchParams.set('citySlug', params.citySlug)
  url.searchParams.set('stopId', params.stopId)
  url.searchParams.set('lines', params.lines.join(','))
  url.searchParams.set('time', params.time)
  if (params.maxCount) url.searchParams.set('maxCount', String(params.maxCount))
  return requestJson(url)
}
