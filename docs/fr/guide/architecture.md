# Architecture

Transitum se compose de quatre briques qui ne communiquent qu'à travers des
fichiers statiques et une petite API HTTP :

- **`frontend/`** — PWA Vue 3 + TypeScript. Lit les données de ville sous
  forme de fichiers JSON et binaires statiques ; n'interroge jamais une
  base de données directement.
- **`pipeline/`** — Python (+ quelques scripts Node) qui transforme des
  tags OSM ou un flux GTFS en fichiers statiques lus par le frontend :
  `routes.json`, `stops.json`, `pois.json`, binaires de routage Minotor, et
  tuiles de carte vectorielles PMTiles.
- **`services/routing/`** — un petit service HTTP Node qui fait tourner le
  même moteur de routage Minotor (RAPTOR) que le chemin hors ligne du
  frontend, pour les clients qui n'ont pas encore téléchargé le pack hors
  ligne d'une ville, ou qui ne peuvent pas l'exécuter côté client.
- **PocketBase** — le seul vrai « backend », utilisé uniquement pour les
  signalements soumis par les utilisateurs (arrêt erroné, ligne modifiée, ...).

## Flux de données

```
Tags OSM  ─┐
           ├─→ pipeline/*.py ─→ data/cities/<slug>/*.json, *.bin, *.pmtiles ─→ frontend
Flux GTFS ─┘
```

Rien dans le frontend ou le service de routage ne parle jamais directement
à Overpass, une URL GTFS ou Nominatim — ce sont des préoccupations propres
au pipeline. Au runtime, une ville n'est qu'un répertoire de fichiers
statiques plus une entrée dans `config/cities/`.

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Vue 3 + TypeScript, Vite, Pinia |
| Rendu de carte | MapLibre GL JS (tuiles vectorielles) |
| Format de tuiles | PMTiles (archive autonome, pas de serveur de tuiles) |
| Recherche côté client | MiniSearch (index plein texte en mémoire) |
| Algorithme de routage | Minotor / RAPTOR (Node.js, format binaire personnalisé) |
| i18n | Vue i18n (es / fr / en fournis ; ajoutez d'autres fichiers JSON par langue au besoin) |
| Backend des signalements | PocketBase (SQLite, API REST) |
| Analytics | Umami (auto-hébergé, sans cookies) |
| Génération de tuiles | Planetiler (Java, exécution locale) |
| Source de données | OpenStreetMap + API Overpass |

## Suite

- [Architecture hors ligne](/fr/guide/offline-architecture) — les deux
  couches de cache et le routage en ligne vs. hors ligne.
- [Recherche de POI](/fr/guide/poi-search) — comment la recherche de
  destination est indexée.
- [Structure du dépôt](/fr/guide/repository-layout) — chaque répertoire,
  ce qu'il possède.
