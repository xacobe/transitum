# Schéma de configuration de ville

Chaque ville est un fichier `config/cities/<slug>.json`. Deux copies de
référence entièrement commentées couvrent chaque champ, une par pattern de
source — copiez les champs dont vous avez besoin depuis celle qui
correspond à votre ville, à la main, dans votre propre
`config/cities/<slug>.json` (le nom de fichier *est* le slug) :

- `config/cities/example-city-a.example.jsonc` — OSM synthétique
- `config/cities/example-city-b.example.jsonc` — GTFS officiel

Ces fichiers sont de la documentation, pas de la configuration —
`pipeline/cities.py` et `frontend/src/cities.ts` ne chargent (par glob)
que les vrais fichiers `config/cities/*.json` de votre propre copie,
jamais les `.example.jsonc`.

## Champs principaux (les deux patterns)

| Champ | Signification |
|---|---|
| `slug` | Doit correspondre au nom de fichier |
| `country` | Une clé de l'objet `"countries"` de `config/cities/_countries.json` |
| `displayName`, `feedId` | Nom affiché ; préfixe d'ID interne pour les IDs d'arrêt/route |
| `center` | `{ lat, lon }` — centre par défaut de la carte |
| `searchBbox` | Les résultats de recherche de destination sont limités à cette boîte |
| `tileBbox` | Bornes passées à Planetiler lors de la génération des tuiles de carte |
| `tileMinzoom` | Niveau de zoom le plus bas pour lequel les tuiles vectorielles sont générées |
| `nearbyRadiusMeters` | Rayon pour « arrêts à proximité » |
| `offlineMb` | Affiché dans l'estimation de taille de téléchargement hors ligne des Réglages — à mettre à jour après `make tiles` |
| `defaultAgencyId` | Repli quand le tag `operator` d'une relation OSM ne correspond à aucune agence déclarée (OSM synthétique uniquement) |
| `agencies` | Tableau de `{ agencyId, agencyName, agencyUrl, agencyTimezone, agencyLang }` |
| `operatorAliases` | OSM synthétique uniquement — associe le texte brut du tag `operator=` à un `agencyId` déclaré |
| `schedule` | `{ averageSpeedKmh, dwellSeconds, serviceStart, serviceEnd, frequencyPeriods }` — repli pour le routage/affichage, supplanté par les vrais horaires GTFS quand disponibles |
| `osmPatches` | `{ areaName, duplicateRelationIds, refAliases, excludeRelationIds }` — toujours requis, car les POI viennent toujours d'OSM quelle que soit la source de transport |

## Champs GTFS-officiel uniquement

| Champ | Signification |
|---|---|
| `useOfficialLineColors` | Utiliser les propres `route_color`/`route_text_color` GTFS de chaque ligne au lieu de la palette par hash |
| `transitSource` | Villes à source unique : `{ type: "official-gtfs", url }` |
| `transitSources` | Villes multi-source : un tableau — voir [Imports multi-source](/fr/cities/multi-source) pour `agencyIds`, `routeShortNames`, `routeTypes`, `stopsWithinBbox`, `collapseRouteIdsBy` |
| `lineOverrides` | Divise une route GTFS en plusieurs lignes perçues par les usagers — voir [Diviser des lignes interlignées](/fr/cities/line-overrides) |

Les champs marqués `(post-pipeline)` dans les commentaires du
`.example.jsonc` doivent être laissés à leurs valeurs par défaut et
renseignés après la première exécution de génération de données.
