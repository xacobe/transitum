/**
 * Generates Minotor transit routing binaries (timetable.bin + stops.bin) for
 * each city from the GTFS zips in data/.cache/.
 *
 * Run from the repo root:
 *   node pipeline/generate_transit_data.mjs
 *
 * Output goes to data/cities/{slug}/. The timetable is generated for today's
 * date. Re-run whenever the GTFS changes (after osm_to_gtfs.py for a city).
 *
 * Minotor v11+ natively supports frequencies.txt — no pre-expansion needed.
 */

import { GtfsParser } from 'minotor/parser'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const dataRoot = path.join(repoRoot, 'data', 'cities')
const gtfsRoot = path.join(repoRoot, 'data', '.cache')

// Cities come from the shared registry, same as the Python pipeline scripts
// (pipeline/cities.py) - keeps this the single source of truth instead of a
// second hardcoded list that silently drifts from config/cities/. One file
// per city, _countries.json excluded (it's the shared country registry,
// not a city).
const citiesDir = path.join(repoRoot, 'config', 'cities')
const cities = fs.existsSync(citiesDir)
  ? fs.readdirSync(citiesDir)
      .filter((f) => f.endsWith('.json') && f !== '_countries.json')
      .map((f) => {
        const slug = f.slice(0, -'.json'.length)
        return { slug, gtfs: `${slug}.gtfs.zip` }
      })
  : []

const today = new Date()

// Collect failures instead of aborting on the first one, so every city still
// gets a chance to generate - but surface them via a non-zero exit code at the
// end. Otherwise a total failure exits 0 and callers (make, use_example.py's
// check=True subprocess) treat generation as successful.
const failures = []

for (const city of cities) {
  const gtfsPath = path.join(gtfsRoot, city.gtfs)
  const outDir   = path.join(dataRoot, city.slug)

  if (!fs.existsSync(gtfsPath)) {
    console.warn(`  skipping ${city.slug} — ${gtfsPath} not found`)
    continue
  }

  console.log(`Parsing ${city.slug}...`)
  try {
    const parser = new GtfsParser(gtfsPath)
    const timetable  = await parser.parseTimetable(today)
    const stopsIndex = await parser.parseStops()

    fs.writeFileSync(path.join(outDir, 'timetable.bin'), timetable.serialize())
    fs.writeFileSync(path.join(outDir, 'stops.bin'), stopsIndex.serialize())
    fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ generatedAt: today.toISOString() }))

    console.log(`  ✓ ${city.slug}: ${stopsIndex.size()} stops`)
  } catch (err) {
    console.error(`  ✗ ${city.slug}:`, err.message)
    failures.push(city.slug)
  }
}

if (failures.length) {
  console.error(`\nFailed to generate routing binaries for ${failures.length} city/cities: ${failures.join(', ')}`)
  process.exitCode = 1
}
