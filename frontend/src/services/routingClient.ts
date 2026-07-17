import type { Itinerary, RoutingParams } from '@/types'

const ROUTING_ENDPOINT = import.meta.env.VITE_ROUTING_URL ?? '/routing/plan'
// Sibling endpoint under the same routing service - VITE_ROUTING_URL already
// points at .../routing/plan, so swap the last path segment.
const DEPARTURES_ENDPOINT = ROUTING_ENDPOINT.replace(/\/plan$/, '/departures')
const REQUEST_TIMEOUT_MS = 8000

export async function fetchRoutingPlan(
  params: RoutingParams & { citySlug: string },
): Promise<{ itineraries: Itinerary[] }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(ROUTING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`routing HTTP ${res.status}`)
    const json = await res.json() as { error?: string; itineraries: Itinerary[] }
    if (json.error) throw new Error(json.error)
    return json
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchStopDepartures(params: {
  citySlug: string
  stopId: string
  lines: string[]
  time: string
  maxCount?: number
}): Promise<{ departures: Record<string, string[]> }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const url = new URL(DEPARTURES_ENDPOINT, window.location.origin)
    url.searchParams.set('citySlug', params.citySlug)
    url.searchParams.set('stopId', params.stopId)
    url.searchParams.set('lines', params.lines.join(','))
    url.searchParams.set('time', params.time)
    if (params.maxCount) url.searchParams.set('maxCount', String(params.maxCount))
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`routing HTTP ${res.status}`)
    const json = await res.json() as { error?: string; departures: Record<string, string[]> }
    if (json.error) throw new Error(json.error)
    return json
  } finally {
    clearTimeout(timeout)
  }
}
