---
layout: home

hero:
  name: Transitum
  text: Progressive web app framework for public transit
  tagline: Explore and navigate a city's transit network — nearby stops, line maps, multi-leg trip planning — offline and tuned to run on 2G/3G connections and low-end phones.
  actions:
    - theme: brand
      text: Get started
      link: /guide/
    - theme: alt
      text: Add a city
      link: /cities/
    - theme: alt
      text: View on GitHub
      link: https://github.com/xacobe/transitum

features:
  - title: No city pre-configured
    details: Ships empty. Two working examples (Bilbao, Ouagadougou/Koudougou/Bobo-Dioulasso) drop in with one command.
  - title: Two data sources
    details: Reconstruct transit topology from OSM tags, or import a real GTFS feed — single-operator or several merged together.
  - title: Built for low connectivity
    details: 2G/3G connections, expensive data, offline-first city packs, no dependency on real-time feeds most operators don't publish.
  - title: Offline routing
    details: Minotor (RAPTOR) runs client-side against downloaded city data, falling back to a server route only when needed.
---
