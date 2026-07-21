import { createServer } from 'http'
import { readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { loadCityData, planRoute, getStopDepartures } from './routing.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR ?? join(__dirname, '../../data/cities')
const CITIES_DIR = process.env.CITIES_DIR ?? join(__dirname, '../../config/cities')
const PORT = Number(process.env.PORT ?? 3001)

// config/cities/*.json (one file per city, _countries.json excluded) is the
// single source of truth for which cities exist (same convention as
// pipeline/cities.py and frontend/src/cities.ts) - CITIES only needs setting
// to serve a *subset* (e.g. running separate routing-serve instances per
// region in a larger deployment), not just to run at all.
const CITY_SLUGS = process.env.CITIES
  ? process.env.CITIES.split(',')
  : readdirSync(CITIES_DIR)
      .filter((f) => f.endsWith('.json') && f !== '_countries.json')
      .map((f) => f.slice(0, -'.json'.length))

console.log(`Loading city data from ${DATA_DIR}...`)
const cities = new Map()
for (const slug of CITY_SLUGS) {
  try {
    cities.set(slug, loadCityData(slug, DATA_DIR))
    console.log(`  ✓ ${slug}`)
  } catch (err) {
    console.error(`  ✗ ${slug}: ${err.message}`)
  }
}
console.log('Ready.')

const MAX_BODY = 65_536 // 64 KB — routing requests are small JSON objects

async function readBody(req) {
  const contentLength = Number(req.headers['content-length'] || 0)
  if (contentLength > MAX_BODY) {
    const err = new Error('Payload too large')
    err.statusCode = 413
    return Promise.reject(err)
  }
  return new Promise((resolve, reject) => {
    const chunks = []
    let received = 0
    req.on('data', (c) => {
      received += c.length
      if (received > MAX_BODY) {
        req.destroy()
        const err = new Error('Payload too large')
        err.statusCode = 413
        reject(err)
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'GET' && url.pathname === '/health') {
    res.end(JSON.stringify({ ok: true, cities: [...cities.keys()] }))
    return
  }

  if (req.method === 'POST' && url.pathname === '/routing/plan') {
    let body
    try {
      body = JSON.parse(await readBody(req))
    } catch (err) {
      res.statusCode = err.statusCode ?? 400
      res.end(JSON.stringify({ error: err.message || 'Invalid JSON body' }))
      return
    }

    const { fromLat, fromLon, toLat, toLon, time, date, citySlug, fromName, toName, numItineraries, transportModes } =
      body
    const cityData = cities.get(citySlug)
    if (!cityData) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: `Unknown city: ${citySlug}` }))
      return
    }

    const lat1 = Number(fromLat), lon1 = Number(fromLon)
    const lat2 = Number(toLat),   lon2 = Number(toLon)
    if ([lat1, lon1, lat2, lon2].some(isNaN)) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Invalid coordinates' }))
      return
    }
    if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'date must be YYYY-MM-DD' }))
      return
    }

    try {
      const itineraries = planRoute(cityData, {
        fromLat: lat1,
        fromLon: lon1,
        toLat: lat2,
        toLon: lon2,
        time: time ?? '08:00:00',
        date: date ?? null,
        fromName: fromName ?? null,
        toName: toName ?? null,
        numItineraries: Math.min(Math.max(1, Number(numItineraries ?? 5)), 10),
        transportModes: Array.isArray(transportModes) ? transportModes : null,
      })
      res.end(JSON.stringify({ itineraries }))
    } catch (err) {
      console.error('planRoute error:', err)
      res.statusCode = 500
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/routing/departures') {
    const citySlug = url.searchParams.get('citySlug')
    const stopId = url.searchParams.get('stopId')
    // Capped well above what any real stop needs — a stop realistically
    // serves a handful of lines, not dozens.
    const lines = (url.searchParams.get('lines') ?? '').split(',').filter(Boolean).slice(0, 20)
    const time = url.searchParams.get('time') ?? '08:00:00'
    const date = url.searchParams.get('date')
    // Capped well above any real day's trip count for a single line — the
    // cap exists to bound the search loop, not because 60 is a meaningful
    // number of departures to show.
    const maxCount = Math.min(Math.max(1, Number(url.searchParams.get('maxCount') ?? 3)), 60)

    if (!citySlug || !stopId || !lines.length) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'citySlug, stopId and lines are required' }))
      return
    }
    if (date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'date must be YYYY-MM-DD' }))
      return
    }

    const cityData = cities.get(citySlug)
    if (!cityData) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: `Unknown city: ${citySlug}` }))
      return
    }

    try {
      const departures = getStopDepartures(cityData, { stopId, lines, time, maxCount, date })
      res.end(JSON.stringify({ departures }))
    } catch (err) {
      console.error('getStopDepartures error:', err)
      res.statusCode = 500
      res.end(JSON.stringify({ error: err.message }))
    }
    return
  }

  res.statusCode = 404
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`routing-serve listening on :${PORT}`)
})
