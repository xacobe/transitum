# Structure du dépôt

```
config/
├── .env.example          ← copier vers .env et renseigner — point d'entrée unique de config du déploiement
└── cities/               ← registre des villes : un <slug>.json par ville (coordonnées, config d'agence,
                             constantes d'horaire) + _countries.json (registre partagé des pays,
                             ville par défaut) — vide par défaut. Les *.example.jsonc sont des copies
                             de référence (les deux patterns de ville supportés, entièrement commentées, non parsées)

examples/
├── spain/                ← pattern GTFS officiel, multi-source (Bilbao : 4 opérateurs, 4 modes)
└── burkina-faso/         ← pattern synthétique OSM, trois villes

data/
├── cities/<city>/        ← sorties prêtes pour l'app (versionnées sauf .bin, patterns.json et .pmtiles)
│   ├── stops.json            liste des arrêts
│   ├── routes.json           géométries de lignes + séquences d'arrêts
│   ├── routes-meta.json      métadonnées de lignes (pas de géométrie, pour les panneaux d'arrêt)
│   ├── pois.json             lieux nommés avec champ de niveau (tier)
│   ├── version.json          horodatage de version des données (invalidation du cache)
│   ├── patterns.json         plan jour de semaine → pattern d'horaire (gitignored, régénérer localement)
│   ├── timetable.<hash>.bin  binaire de routage Minotor, un par pattern de jour de semaine (gitignored, régénérer localement)
│   ├── stops.bin              binaire des arrêts Minotor (gitignored, régénérer localement)
│   └── tiles.pmtiles         tuiles de carte vectorielles (gitignored, régénérer localement)
├── gtfs/<country>/<city>/  ← fichiers source GTFS synthétiques versionnés (créés à la main depuis OSM)
└── .cache/               ← PBF OSM téléchargés + zips GTFS générés (gitignored)

pipeline/                 ← scripts de génération de données (Python + Node), membre du workspace npm
├── use_example.py            copie un fixture examples/<name>/ dans config/cities/ + data/
├── add_city.py                interroge Nominatim, écrit un config/cities/<slug>.json de départ
├── osm_to_gtfs.py            relations OSM → GTFS synthétique
├── import_gtfs.py            télécharge + remappe un seul flux GTFS officiel
├── import_gtfs_multi.py      fusionne plusieurs flux GTFS officiels (voir Ajouter une ville → Multi-source)
├── osm_to_pois.py            OSM → pois.json
├── gtfs_stops_to_json.py     arrêts GTFS → stops.json
├── gtfs_routes_to_json.py    formes GTFS + OSM → routes.json + routes-meta.json
├── generate_transit_data.mjs zip GTFS → timetable.<hash>.bin (par pattern de jour) + stops.bin (Minotor)
├── generate_pmtiles.py       PBF OSM → tiles.pmtiles (Planetiler)
├── check_osm_routes.py       CI : détecte les changements de routes OSM depuis la dernière synchro
├── cities.py                 utilitaires de chemins partagés + chargeur du registre des villes
└── package.json               déclare 'minotor' (aussi dépendance du frontend - voir package.json racine)

frontend/                 ← PWA Vue 3 + TypeScript, membre du workspace npm
├── src/
│   ├── views/                un fichier par écran
│   ├── components/
│   ├── composables/
│   ├── stores/               stores Pinia
│   ├── services/             index de recherche, client de routage, client PocketBase
│   ├── i18n/locales/         es.json + fr.json + en.json
│   └── styles/               tokens de design + styles de base globaux
├── vite.config.js            envDir → config/, middleware de dev pour /data
└── public/                   favicon, icônes, images

services/
├── routing/              ← serveur de routage Node.js Minotor/RAPTOR (POST /routing/plan)
└── pocketbase/           ← service PocketBase (backend des signalements)

deploy/
└── nginx/default.conf.template  ← reverse proxy, HTTPS, limitation de débit, en-têtes de cache (${DOMAIN} injecté)

docs/                     ← ce site de documentation (VitePress), membre du workspace npm

.github/workflows/
├── ci.yml                ← typecheck + build à chaque PR
├── data-sync-routes.yml  ← quotidien : détecte les changements OSM → régénère le GTFS → déploie
├── data-sync-pois.yml    ← mensuel : régénère les POI → déploie
└── docs-deploy.yml       ← au push sur docs/ : construit et publie ce site sur GitHub Pages

Makefile                  ← cibles dev/build/data/deploy (commencer ici)
docker-compose.yml
package.json               ← racine des workspaces npm (frontend/ + pipeline/ + docs/ partagent un
                              seul node_modules ; services/routing/ reste un projet séparé, hors
                              workspace, installé dans sa propre image Docker)
```
