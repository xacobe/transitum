/**
 * Per-city offline tile management.
 *
 * Downloads the city's PMTiles file and stores it as a Blob in IndexedDB
 * so the map works without a network connection. The composable is a module
 * singleton — all callers share the same reactive state (progress, downloaded set).
 *
 * Offline routing data (Minotor RAPTOR binaries) is also stored in the same
 * IDB store under 'timetable-{slug}' and 'stops-{slug}' keys and fetched
 * together with the tile download.
 */

import { ref, reactive } from 'vue'

const DB_NAME    = 'transit-offline'
const DB_VERSION = 1
const STORE      = 'tiles'

// ── IndexedDB helpers ──────────────────────────────────────────────────────

let _db: IDBDatabase | null = null
async function openDB(): Promise<IDBDatabase> {
  if (_db) return _db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess      = () => { _db = req.result; resolve(_db) }
    req.onerror        = () => reject(req.error)
  })
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
    req.onerror   = () => reject(req.error)
  })
}

async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

async function idbDelete(key: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror    = () => reject(tx.error)
  })
}

async function idbKeys(): Promise<string[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).getAllKeys()
    req.onsuccess = () => resolve(req.result as string[])
    req.onerror   = () => reject(req.error)
  })
}

// ── Key / URL helpers ──────────────────────────────────────────────────────
function tileUrl(slug: string): string {
  return `/data/${slug}/tiles.pmtiles`
}

// ── Module-level shared state ──────────────────────────────────────────────

const downloaded    = ref(new Set<string>())                 // IDB keys that have a stored blob
const progress      = reactive<Record<string, number>>({})   // IDB key → 0-1 while downloading
const sizes         = reactive<Record<string, number>>({})   // IDB key → bytes stored
const downloadedAt  = reactive<Record<string, string>>({})   // slug → ISO string (when routing data was last downloaded)
const updateAvail   = reactive<Record<string, boolean>>({})  // slug → true when server has newer routing data
const updatingData  = reactive<Record<string, boolean>>({})  // slug → true while an updateDataFiles() call is in flight
let   _initialized  = false

// Silently checks whether the server has newer routing data for a city.
// Sets updateAvail[slug] if version.json is newer than the stored downloadedAt.
async function checkForUpdates(slug: string): Promise<void> {
  try {
    const resp = await fetch(`/data/${slug}/version.json`, { cache: 'no-store' })
    if (!resp.ok) return
    const { generatedAt } = await resp.json() as { generatedAt: string }
    const localTs = downloadedAt[slug]
    updateAvail[slug] = !localTs || new Date(generatedAt) > new Date(localTs)
  } catch { /* offline or no version.json yet — leave updateAvail unchanged */ }
}

async function init(): Promise<void> {
  if (_initialized) return
  _initialized = true
  try {
    const keys = await idbKeys()
    for (const k of keys) downloaded.value.add(k)

    // Load downloadedAt timestamps for all cities that have routing data stored
    const slugsWithData = keys
      .filter(k => k.startsWith('timetable-'))
      .map(k => k.replace('timetable-', ''))
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

// Re-downloads only the routing data files (timetable.bin + stops.bin + routes.json).
// Much faster than a full tile re-download; tiles almost never change.
async function updateDataFiles(slug: string): Promise<void> {
  updatingData[slug] = true
  try {
    const [ttResp, stResp] = await Promise.all([
      fetch(`/data/${slug}/timetable.bin`),
      fetch(`/data/${slug}/stops.bin`),
    ])
    if (!ttResp.ok || !stResp.ok) throw new Error(`HTTP error fetching routing data`)
    const [ttBuf, stBuf] = await Promise.all([ttResp.arrayBuffer(), stResp.arrayBuffer()])
    const now = new Date().toISOString()
    await Promise.all([
      idbPut(`timetable-${slug}`, ttBuf),
      idbPut(`stops-${slug}`, stBuf),
      idbPut(`downloadedAt-${slug}`, now),
    ])
    downloadedAt[slug] = now
    updateAvail[slug] = false
    try {
      const cache = await caches.open('city-routes')
      await Promise.all([
        cache.delete(`/data/${slug}/routes.json`),
        cache.delete(`/data/${slug}/routes-meta.json`),
      ])
      await Promise.all([
        cache.add(`/data/${slug}/routes.json`),
        cache.add(`/data/${slug}/routes-meta.json`),
      ])
    } catch { /* non-critical */ }
  } finally {
    delete updatingData[slug]
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

      // Fetch and store Minotor RAPTOR binaries for offline routing.
      // Generated by the pipeline (see pipeline/generate_transit_data.mjs).
      try {
        const [ttResp, stResp] = await Promise.all([
          fetch(`/data/${slug}/timetable.bin`),
          fetch(`/data/${slug}/stops.bin`),
        ])
        if (ttResp.ok && stResp.ok) {
          const [ttBuf, stBuf] = await Promise.all([ttResp.arrayBuffer(), stResp.arrayBuffer()])
          const now = new Date().toISOString()
          await Promise.all([
            idbPut(`timetable-${slug}`, ttBuf),
            idbPut(`stops-${slug}`,     stBuf),
            idbPut(`downloadedAt-${slug}`, now),
          ])
          downloadedAt[slug] = now
          updateAvail[slug] = false
        }
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

  /**
   * Returns the Minotor RAPTOR binary data for a city, or null if not stored.
   */
  async function getMinotorData(slug: string): Promise<{ timetableData: Uint8Array; stopsData: Uint8Array } | null> {
    try {
      const [ttBuf, stBuf] = await Promise.all([
        idbGet<ArrayBuffer>(`timetable-${slug}`),
        idbGet<ArrayBuffer>(`stops-${slug}`),
      ])
      if (!ttBuf || !stBuf) return null
      return { timetableData: new Uint8Array(ttBuf), stopsData: new Uint8Array(stBuf) }
    } catch { return null }
  }

  /** Removes all stored offline data for a city (tiles + Minotor bins). */
  async function deleteCity(slug: string): Promise<void> {
    await Promise.all([
      idbDelete(slug),
      idbDelete(`timetable-${slug}`),
      idbDelete(`stops-${slug}`),
      idbDelete(`downloadedAt-${slug}`),
    ])
    downloaded.value = new Set([...downloaded.value].filter(k => k !== slug))
    delete sizes[slug]
    delete downloadedAt[slug]
    delete updateAvail[slug]
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
