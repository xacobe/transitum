# Référence du pipeline

Tous les scripts du pipeline prennent `--city <slug>`. Les slugs
disponibles sont les noms de fichiers sous `config/cities/` (sans
`.json`).

## Scripts

| Script | Produit |
|---|---|
| `use_example.py` | Copie un fixture `examples/<name>/` dans `config/cities/` + `data/` |
| `add_city.py` | Interroge Nominatim, écrit un `config/cities/<slug>.json` de départ |
| `osm_to_gtfs.py` | Relations OSM → GTFS synthétique |
| `import_gtfs.py` | Importe un seul flux GTFS officiel |
| `import_gtfs_multi.py` | Fusionne plusieurs flux GTFS officiels (voir [Imports multi-source](/fr/cities/multi-source)) |
| `gtfs_routes_to_json.py` | Formes GTFS + OSM → `routes.json` / `routes-meta.json` — géométries de lignes, arrêts, fréquence |
| `gtfs_stops_to_json.py` | Arrêts GTFS → `stops.json` |
| `osm_to_pois.py` | Overpass OSM → `pois.json` |
| `generate_transit_data.mjs` | Zip GTFS → binaires de routage Minotor, un `timetable.<hash>.bin` par pattern de service distinct par jour de semaine (`patterns.json`), plus `stops.bin` |
| `generate_pmtiles.py` | PBF OSM → `tiles.pmtiles` (Planetiler ; voir [Générer les tuiles de carte](/fr/cities/map-tiles)) |
| `check_osm_routes.py` | CI : détecte les changements de routes OSM depuis la dernière synchro |
| `cities.py` | Utilitaires de chemins partagés + chargeur du registre des villes |

Tout ce qui suit `gtfs_routes_to_json.py` est indépendant de la source —
cela fonctionne à l'identique, que le GTFS vienne d'`osm_to_gtfs.py`,
`import_gtfs.py` ou `import_gtfs_multi.py`.

## Régénérer les données d'une ville

Deux variantes selon l'origine des données de transport de la ville (voir
[Ajouter une ville](/fr/cities/)) :

```bash
make data CITY=votre-ville                                              # OSM synthétique
make import-gtfs CITY=votre-ville URL=https://exemple.org/gtfs.zip      # flux GTFS officiel
```

`make data` exécute `osm_to_gtfs.py` puis les étapes partagées
routes/arrêts/POI/binaires. `make import-gtfs` remplace la première étape
par `import_gtfs.py` (télécharge et remappe les IDs d'agence sur le flux
officiel à la place) et exécute les mêmes étapes partagées — exposées
seules comme :

```bash
make data-common CITY=votre-ville
```

Régénérer les POI pour toutes les villes actives (depuis `VITE_CITIES`
dans `config/.env`) :

```bash
make pois
```

Générer les tuiles de carte vectorielles (nécessite Java 17+ et le PBF OSM
dans `data/.cache/`, ou `--docker`) :

```bash
make tiles CITY=votre-ville
```

## Suite

- [Schéma de configuration de ville](/fr/pipeline/config-schema) — chaque
  champ, dans les fichiers de référence entièrement commentés.
- [Fichiers de données générés](/fr/pipeline/data-files) — ce qu'écrit
  chaque script, et ce qui est versionné vs. gitignoré.
