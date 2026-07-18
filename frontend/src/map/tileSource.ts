/**
 * PMTiles source resolution for MiniMap: remote URL when online-only, or a
 * locally stored Blob (IndexedDB, see composables/useOfflineTiles) when the
 * city's tiles are downloaded.
 *
 * This module lives in the lazy MiniMap chunk (it is only imported from
 * there), so pmtiles/maplibre-gl stay out of the main bundle.
 */
import maplibregl from 'maplibre-gl'
import { Protocol, PMTiles } from 'pmtiles'

// Register the pmtiles:// protocol once globally, when this chunk first
// loads. addProtocol is idempotent, so re-evaluation is safe.
const pmtilesProtocol = new Protocol()
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile)

/**
 * Serves byte-range requests for a locally-stored Blob (offline tiles).
 * The PMTiles library calls getBytes(offset, length) for each tile it needs;
 * we slice the Blob on demand instead of loading the whole file into memory.
 */
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

/**
 * Returns the pmtiles:// URL to use as the vector tile source for a city.
 * If the city's tiles are stored offline, registers a BlobSource with the
 * pmtiles protocol and returns its key; otherwise returns the remote URL.
 */
export async function resolveTileUrl(
  slug: string,
  getOfflineBlob: (slug: string) => Promise<Blob | null>,
): Promise<string> {
  const blob = await getOfflineBlob(slug)
  if (blob) {
    const key = `offline-${slug}`
    // Route tile requests for this key to the local Blob instead of the network.
    pmtilesProtocol.add(new PMTiles(new BlobSource(blob, key)))
    return `pmtiles://${key}`
  }
  return `pmtiles://${window.location.origin}/data/${slug}/tiles.pmtiles`
}
