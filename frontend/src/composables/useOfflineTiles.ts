/**
 * Per-city offline tile management.
 *
 * Downloads the city's PMTiles file and stores it as a Blob in IndexedDB
 * so the map works without a network connection. The composable is a module
 * singleton — all callers share the same reactive state (progress, downloaded set).
 *
 * Offline routing data (Minotor RAPTOR binaries) is fetched together with
 * the tile download, but lives in its own module (services/offlineRoutingData.ts)
 * since it's a genuinely separate concern (weekday service patterns, not
 * tiles) - this file re-exports its public functions so every existing
 * `@/composables/useOfflineTiles` import keeps working unchanged. The raw
 * IndexedDB primitives both modules share live in services/offlineDb.ts.
 */

import { ref, reactive } from 'vue'
import { idbGet, idbPut, idbDelete, idbKeys } from '@/services/offlineDb'
import {
  downloadedAt, updateAvail, updatingData,
  storeRoutingData, getMinotorData, updateDataFiles, checkForUpdates, deleteRoutingData,
} from '@/services/offlineRoutingData'

// ── Key / URL helpers ──────────────────────────────────────────────────────
function tileUrl(slug: string): string {
  return `/data/${slug}/tiles.pmtiles`
}

// ── Module-level shared state (tile group only - routing-data state lives
// in offlineRoutingData.ts) ─────────────────────────────────────────────────

const downloaded    = ref(new Set<string>())                 // IDB keys that have a stored blob
const progress      = reactive<Record<string, number>>({})   // IDB key → 0-1 while downloading
const sizes         = reactive<Record<string, number>>({})   // IDB key → bytes stored
let   _initialized  = false

async function init(): Promise<void> {
  if (_initialized) return
  _initialized = true
  try {
    const keys = await idbKeys()
    for (const k of keys) downloaded.value.add(k)

    // Load downloadedAt timestamps for all cities that have routing data stored
    const slugsWithData = keys
      .filter(k => k.startsWith('patterns-'))
      .map(k => k.replace('patterns-', ''))
    await Promise.all(slugsWithData.map(async (slug) => {
      const ts = await idbGet<string>(`downloadedAt-${slug}`)
      if (ts) downloadedAt[slug] = ts
    }))

    // Background freshness check — non-blocking, fires and forgets
    for (const slug of slugsWithData) {
      checkForUpdates(slug).catch(() => {})
    }
  } catch {
    // IndexedDB unavailable (private mode, storage denied) — silently disabled.
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export function useOfflineTiles() {
  // Lazy init — populate `downloaded` from IndexedDB on first use.
  init()

  function isDownloaded(slug: string): boolean {
    return downloaded.value.has(slug)
  }

  function isDownloading(slug: string): boolean {
    return slug in progress
  }

  function getProgress(slug: string): number {
    return progress[slug] ?? 0
  }

  function getSizeMb(slug: string): string | null {
    const s = sizes[slug]
    return s ? (s / 1_000_000).toFixed(1) : null
  }

  /** Returns the stored tile Blob, or null if not downloaded. */
  async function getOfflineBlob(slug: string): Promise<Blob | null> {
    if (downloaded.value.has(slug)) return idbGet<Blob>(slug)
    return null
  }

  /** Downloads tiles for the city and stores in IndexedDB. */
  async function downloadCity(slug: string): Promise<void> {
    if (slug in progress) return
    progress[slug] = 0

    try {
      // XHR gives real-time progress via onprogress and is more reliable than
      // fetch() streaming on iOS Safari in standalone (home-screen PWA) mode,
      // where ReadableStream from fetch is unreliable in some WebKit versions.
      const blob = await new Promise<Blob>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('GET', tileUrl(slug))
        xhr.responseType = 'blob'
        xhr.onprogress = ({ loaded, total, lengthComputable }) => {
          if (lengthComputable) progress[slug] = loaded / total
        }
        xhr.onload  = () => xhr.status === 200
          ? resolve(xhr.response as Blob)
          : reject(new Error(`HTTP ${xhr.status}`))
        xhr.onerror = () => reject(new Error('Network error'))
        xhr.send()
      })
      await idbPut(slug, blob)
      downloaded.value = new Set([...downloaded.value, slug])
      sizes[slug] = blob.size

      // Pre-cache city data files so all offline features work immediately
      // after download. routes-meta.json for StopView stop lists; routes.json
      // for LineView map geometry and offline routing.
      try {
        const cache = await caches.open('city-routes')
        await Promise.all([
          cache.add(`/data/${slug}/routes.json`),
          cache.add(`/data/${slug}/routes-meta.json`),
        ])
      } catch { /* non-critical */ }

      try {
        await Promise.all([
          fetch(`/data/${slug}/stops.json`),
          fetch(`/data/${slug}/pois.json`),
        ])
      } catch { /* non-critical — both get cached on first natural use */ }

      try {
        await storeRoutingData(slug)
      } catch { /* non-critical — offline routing falls back to "no route" */ }

      // Pre-fetch map label glyphs (Noto Sans .pbf from OpenFreeMap CDN) so
      // map labels render immediately offline after first download, without
      // requiring a prior map interaction to warm the SW's glyph cache.
      try {
        const base   = 'https://tiles.openfreemap.org/fonts'
        const ranges = ['0-255', '256-511']
        await Promise.all(
          ['Noto Sans Regular', 'Noto Sans Bold', 'Noto Sans Italic'].flatMap(face =>
            ranges.map(r => fetch(`${base}/${encodeURIComponent(face)}/${r}.pbf`))
          )
        )
      } catch { /* non-critical — labels still load when online */ }

    } catch (err) {
      console.error('[offline] download failed', slug, err)
      throw err
    } finally {
      delete progress[slug]
    }
  }

  /** Removes all stored offline data for a city (tiles + Minotor bins). */
  async function deleteCity(slug: string): Promise<void> {
    await Promise.all([
      idbDelete(slug),
      deleteRoutingData(slug),
    ])
    downloaded.value = new Set([...downloaded.value].filter(k => k !== slug))
    delete sizes[slug]
    try {
      const cache = await caches.open('city-routes')
      await Promise.all([
        cache.delete(`/data/${slug}/routes.json`),
        cache.delete(`/data/${slug}/routes-meta.json`),
      ])
    } catch { /* ignore */ }
  }

  function getDownloadedAt(slug: string): string | null {
    return downloadedAt[slug] ?? null
  }

  function isUpdateAvailable(slug: string): boolean {
    return updateAvail[slug] === true
  }

  function isUpdatingData(slug: string): boolean {
    return slug in updatingData
  }

  return {
    isDownloaded,
    isDownloading,
    getProgress,
    getSizeMb,
    getOfflineBlob,
    downloadCity,
    deleteCity,
    getMinotorData,
    getDownloadedAt,
    isUpdateAvailable,
    isUpdatingData,
    updateDataFiles,
    checkForUpdates,
  }
}
