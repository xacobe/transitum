/**
 * Generates Minotor transit routing binaries (timetable.*.bin + stops.bin) for
 * each city from the GTFS zips in data/.cache/.
 *
 * Run from the repo root:
 *   node pipeline/generate_transit_data.mjs
 *
 * Output goes to data/cities/{slug}/. Unlike a single "today" snapshot, this
 * generates one Minotor Timetable per distinct GTFS calendar service pattern
 * (weekday-level: Mon/Tue/.../Sun, deduplicated by content) so route planning
 * for a Saturday, a Sunday, or any weekday is always correct - not just
 * whatever day the pipeline last happened to run on. calendar_dates.txt
 * exceptions (specific holidays) are recorded but not baked into an offline
 * binary - see patterns.json's exceptionDates.
 *
 * Minotor v11+ natively supports frequencies.txt - no pre-expansion needed.
 */

import { GtfsParser } from 'minotor/parser'
import StreamZip from 'node-stream-zip'
import { parse } from 'csv-parse/sync'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const dataRoot = path.join(repoRoot, 'data', 'cities')
const gtfsRoot = path.join(repoRoot, 'data', '.cache')

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

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

function toUtcDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d))
}

function ymd(date) {
  return date.toISOString().slice(0, 10)
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * 86400_000)
}

async function readCalendarInfo(gtfsPath) {
  const zip = new StreamZip.async({ file: gtfsPath })
  try {
    const entries = await zip.entries()
    const exceptionDates = new Set()
    let validFrom = null
    let validUntil = null

    if (entries['calendar.txt']) {
      const raw = (await zip.entryData('calendar.txt')).toString('utf8')
      const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true })
      for (const row of rows) {
        if (row.start_date && (!validFrom || row.start_date < validFrom)) validFrom = row.start_date
        if (row.end_date && (!validUntil || row.end_date > validUntil)) validUntil = row.end_date
      }
    }

    if (entries['calendar_dates.txt']) {
      const raw = (await zip.entryData('calendar_dates.txt')).toString('utf8')
      const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true })
      for (const row of rows) {
        if (row.date) exceptionDates.add(row.date)
      }
    }

    const fmt = (s) => (s ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null)
    return {
      validFrom: fmt(validFrom),
      validUntil: fmt(validUntil),
      exceptionDates: [...exceptionDates].map(fmt).sort(),
    }
  } finally {
    await zip.close()
  }
}

// For each weekday, the next date >= today that falls on it. Deliberately
// does NOT try to dodge calendar_dates.txt exceptions: real feeds (e.g. a
// weeks-long metro diversion during construction) can carry an exception on
// nearly every near-term date, so skipping them risks landing outside the
// feed's valid_until window entirely. Using the very next occurrence means
// each pattern reflects the schedule genuinely in effect right now, and
// self-corrects on every pipeline regeneration as exceptions come and go.
function representativeDates(today) {
  const dates = []
  for (let weekday = 0; weekday < 7; weekday++) {
    let candidate = today
    while (candidate.getUTCDay() !== weekday) candidate = addUtcDays(candidate, 1)
    dates.push(candidate)
  }
  return dates
}

function hashBytes(bytes) {
  return crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 8)
}

const today = toUtcDate(
  new Date().getUTCFullYear(),
  new Date().getUTCMonth() + 1,
  new Date().getUTCDate(),
)

for (const city of cities) {
  const gtfsPath = path.join(gtfsRoot, city.gtfs)
  const outDir   = path.join(dataRoot, city.slug)

  if (!fs.existsSync(gtfsPath)) {
    console.warn(`  skipping ${city.slug} — ${gtfsPath} not found`)
    continue
  }

  console.log(`Parsing ${city.slug}...`)
  try {
    const { validFrom, validUntil, exceptionDates } = await readCalendarInfo(gtfsPath)
    const dates = representativeDates(today)

    const parser = new GtfsParser(gtfsPath)
    const stopsIndex = await parser.parseStops()
    fs.writeFileSync(path.join(outDir, 'stops.bin'), stopsIndex.serialize())

    // Remove any pattern binaries from a previous run before writing the
    // current set, so a shrink from N patterns to fewer doesn't leave stale
    // files behind.
    for (const f of fs.readdirSync(outDir)) {
      if (/^timetable\.[0-9a-f]{8}\.bin$/.test(f)) fs.unlinkSync(path.join(outDir, f))
    }

    const weekdayToPattern = {}
    const writtenHashes = new Set()
    for (let weekday = 0; weekday < 7; weekday++) {
      const timetable = await parser.parseTimetable(dates[weekday])
      const bytes = timetable.serialize()
      const hash = hashBytes(bytes)
      weekdayToPattern[WEEKDAY_KEYS[weekday]] = hash
      if (!writtenHashes.has(hash)) {
        fs.writeFileSync(path.join(outDir, `timetable.${hash}.bin`), bytes)
        writtenHashes.add(hash)
      }
    }

    fs.writeFileSync(path.join(outDir, 'patterns.json'), JSON.stringify({
      weekdayToPattern,
      validFrom,
      validUntil,
      exceptionDates,
    }, null, 2))

    fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ generatedAt: new Date().toISOString() }))

    console.log(`  ✓ ${city.slug}: ${stopsIndex.size()} stops, ${writtenHashes.size} distinct service pattern(s)`)
  } catch (err) {
    console.error(`  ✗ ${city.slug}:`, err.message)
  }
}
