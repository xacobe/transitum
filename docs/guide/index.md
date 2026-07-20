# Introduction

Transitum is a progressive web app framework for public transit, designed
to answer two questions for any city: **"which bus stops near me?"** and
**"how do I get from A to B?"**

It ships with no city pre-configured — `config/cities/` is empty by default.
Adding a real city is a data task, not a code change: point the pipeline at
either OpenStreetMap tags or a real GTFS feed, and the frontend, offline
routing engine, and map tiles all pick it up automatically.

## Who this is for

A city, transit agency, or civic-tech group that wants a transit app without
building one from scratch, in a place where:

- connectivity is unreliable or expensive (2G/3G, metered data)
- no operator publishes real-time vehicle positions
- schedules are either a real GTFS feed or nothing more precise than
  "a bus roughly every 15 minutes"

## Features

- **Nearby stops** — closest bus stops on an interactive map and in a list view
- **Route planning** — multi-leg itineraries with walking segments, up to 5 Pareto-optimal alternatives
- **Line browser** — full line list with route map and stop timeline for each direction
- **Favorites** — saved stops and itineraries, persisted locally
- **Offline mode** — city pack (vector map tiles, routing binaries, stop list, POIs) works fully offline after first load
- **Real or estimated timetables** — shows actual next-departure times for lines with a published schedule, falls back to a "Frequent / Infrequent" estimate for OSM-synthetic cities with no real timetable, per line (a single city/feed can mix both)
- **Multi-city** — city auto-detected by GPS on first launch; switchable manually from Settings
- **Multi-modal filtering** — filter the line browser and route planning by transport mode (bus, metro, tram, rail, ferry, ...) when a city has more than one
- **Multi-language UI** — full i18n (`frontend/src/i18n/locales/`), each deployment picks its own default and active subset via `.env`
- **Light / dark theme**
- **Incident reports** — contextual report button on stops and lines, backed by PocketBase

## What's in this documentation

- **[Adding a city](/cities/)** — the data work: OSM-synthetic vs. official
  GTFS, merging several operators' feeds, generating map tiles, and a full
  worked example.
- **[Pipeline reference](/pipeline/)** — the city config schema and what
  each pipeline script produces.
- **[Deployment](/deployment/)** — running your own instance, theming it,
  and staying in sync with framework updates.
- **[Contributing](/contributing/)** — known tech debt and how the project
  is structured for contributions.
