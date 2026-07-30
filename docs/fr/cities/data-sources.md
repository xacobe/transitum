# OSM synthétique vs. GTFS officiel

Les données de transport (arrêts/routes/horaires — pas les POI, qui
viennent toujours d'OSM) peuvent provenir de l'une ou l'autre source. Voir
`config/cities/example-city-a.example.jsonc` (OSM synthétique) et
`config/cities/example-city-b.example.jsonc` (GTFS officiel) pour des
exemples entièrement commentés des deux.

- **GTFS officiel** (préféré quand il existe) — l'opérateur ou le portail
  open-data de la ville/région publie un vrai flux avec de vrais horaires.
  Bien plus complet que tout ce qui peut être reconstruit à partir des tags
  OSM : de vrais horaires au lieu d'une fréquence estimée, et une
  couverture complète des lignes au lieu de ce qui se trouve être tagué
  dans OSM. Cherchez-en un sur le portail open-data de la ville/région, un
  point d'accès national (les opérateurs de l'UE sont tenus d'en publier
  un), ou un catalogue de flux comme
  [mobilitydatabase.org](https://mobilitydatabase.org) ou
  [transit.land](https://transit.land). Si vous en trouvez un, passez
  directement à
  [Importer un seul flux officiel](#importer-un-seul-flux-officiel)
  ci-dessous.
- **OSM synthétique** (repli) — aucune agence ne publie de flux, donc la
  topologie est reconstruite à partir du tagage des relations de route OSM
  (relations `route=bus`) et les horaires sont une estimation de fréquence
  configurée à la main. La couverture est aussi bonne que le tagage OSM
  pour cette ville/ce réseau — peut être significativement incomplète pour
  les villes peu cartographiées côté transport sur OSM.

## Reconstruction depuis OSM

```bash
make data CITY=votre-ville
```

Cela génère tous les fichiers de données dans `data/cities/votre-ville/` —
arrêts, routes, POI et binaires de routage. La première exécution
interroge l'API Overpass ; comptez quelques minutes pour une grande ville.
En coulisses, cela exécute, dans l'ordre :

1. `pipeline/osm_to_gtfs.py` — relations OSM → GTFS synthétique dans `data/gtfs/`
2. `pipeline/gtfs_routes_to_json.py` — GTFS + OSM → `data/cities/<ville>/routes.json`
3. `pipeline/gtfs_stops_to_json.py` — arrêts GTFS → `data/cities/<ville>/stops.json`
4. `pipeline/osm_to_pois.py` — Overpass OSM → `data/cities/<ville>/pois.json`
5. `npm run generate-transit-data` — GTFS → `timetable.<hash>.bin` (un par pattern de jour) + `stops.bin`

Les étapes 2 à 5 sont partagées avec le chemin GTFS officiel ci-dessous
(exposées seules comme `make data-common CITY=<ville>`) — tout ce qui suit
le GTFS brut est indépendant de la source.

Après l'exécution du pipeline, vérifiez sa sortie pour des avertissements
sur des IDs de relation dupliqués ou des tags `ref=` non reconnus. Si l'un
d'eux apparaît, renseignez `duplicateRelationIds` et `refAliases` sous
`osmPatches` dans le `config/cities/<slug>.json` de la ville, puis
relancez. Si la zone capture aussi des relations géographiquement dans le
périmètre mais qui n'appartiennent pas réellement au réseau de cette
ville — un lieu homonyme ailleurs dans le monde (la correspondance par nom
de zone d'Overpass n'est pas unique — par ex. « Vigo » correspond à la
fois à la ville galicienne et à un village du Kent, en Angleterre), ou une
ligne interurbaine/régionale légitime mais hors périmètre qui passe juste
par là — listez leurs IDs de relation sous `excludeRelationIds` dans le
même objet et relancez.

## Importer un seul flux officiel

```bash
make import-gtfs CITY=votre-ville URL=https://exemple.org/opendata/gtfs.zip
```

Télécharge le flux, remappe son ou ses `agency_id` vers ceux déclarés sous
`agencies` (par ordre — le cas courant est une agence de chaque côté ; le
script s'arrête avec une erreur demandant de les mapper à la main si les
comptes ne correspondent pas), et exécute les mêmes étapes
routes/arrêts/POI/binaires que ci-dessus. Ajoutez un objet `transitSource`
au `config/cities/<slug>.json` de la ville, enregistrant
`"type": "official-gtfs"` et l'`url` du flux, pour qu'il soit clair plus
tard d'où viennent les données et où les retélécharger — voir
`config/cities/example-city-b.example.jsonc`.

Certains flux ne couvrent qu'une courte fenêtre de calendrier glissante
(vérifiez la plage de dates de `calendar_dates.txt` après l'import) — si
c'est le cas, prévoyez de relancer `make import-gtfs` périodiquement pour
le garder à jour ; il n'y a pas encore de workflow de resynchronisation
automatique pour ce chemin (contrairement à `data-sync-routes.yml` pour le
chemin OSM).

Si le transport de la ville est réparti entre *plusieurs* opérateurs sans
qu'un seul flux ne les couvre tous, voir
[Imports multi-source](/fr/cities/multi-source) à la place.
