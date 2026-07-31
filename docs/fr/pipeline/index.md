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

## Resynchronisation automatique (CI)

Deux workflows GitHub Actions planifiés maintiennent les données déployées à
jour sans ré-exécution manuelle — `.github/workflows/data-sync-routes.yml`
(quotidien, `0 2 * * *`) et `data-sync-pois.yml` (mensuel, le 1er du mois).
Les deux sont opt-in, pas opt-out : leur déclencheur planifié ne fait rien
tant qu'un déploiement ne définit pas `OSM_ROUTES_SYNC_ENABLED` /
`OSM_POIS_SYNC_ENABLED` à `true` (également une variable de dépôt) — même
logique que les points d'extension analytics/backend personnalisé, un
clone fraîchement créé ne devrait pas se mettre à faire du SSH vers un
serveur que personne n'a encore configuré. Voir
[Déploiement](/fr/deployment/#synchronisation-automatique-des-donnees-optionnel)
pour la checklist complète (secrets, variables). Les exécutions manuelles
(`workflow_dispatch`) fonctionnent toujours quel que soit le drapeau, utile
pour essayer l'un ou l'autre workflow avant de s'engager sur la
planification.

Quelles villes sont vérifiées est déjà propre à chaque déploiement (lu
depuis `config/cities/`), et la pause entre chaque vérification de ville
OSM-synthétique l'est aussi — réglez une variable de dépôt
`OSM_SYNC_SLEEP_SECONDS` (Settings → Actions → Variables, même mécanisme
que `DEPLOY_PATH`, voir [Déploiement](/fr/deployment/)) selon le nombre de
telles villes que le déploiement possède réellement, sans avoir à modifier
le fichier du workflow. La fréquence du cron est la seule chose qui ne peut
pas suivre ce modèle — GitHub Actions n'accepte qu'une expression cron
littérale, pas une variable — donc passer de quotidien à, disons, tous les
3 jours nécessite soit de modifier `data-sync-routes.yml` directement
(accepté comme une divergence délibérée par rapport à upstream, comme pour
tout autre fichier appartenant au framework), soit de désactiver la
planification depuis l'onglet Actions et de s'appuyer sur le déclencheur
`workflow_dispatch` du workflow (déjà en place, avec une entrée
`force_cities`) pour des exécutions manuelles à la place.

La synchro quotidienne des routes est moins coûteuse qu'il n'y paraît :
`check_osm_routes.py` ignore d'emblée toute ville en GTFS officiel (elles ne
viennent pas d'OSM, donc rien à vérifier), et pour les villes OSM-synthétiques
restantes, il ne lance qu'une petite requête Overpass incrémentale
(`out count;`, relations modifiées depuis la dernière exécution) avec une
courte pause entre chaque ville — pas un téléchargement complet. Seule une
ville avec des changements réellement détectés passe par la régénération
complète plus lourde (`osm_to_gtfs.py` et la suite) dans cette même
exécution. La synchro mensuelle des POI touche en revanche toutes les villes
(les POI viennent toujours d'OSM, quelle que soit la source de transport) et
exécute la vraie requête `osm_to_pois.py` à chaque fois, d'où sa fréquence
mensuelle plutôt que quotidienne.

## Suite

- [Schéma de configuration de ville](/fr/pipeline/config-schema) — chaque
  champ, dans les fichiers de référence entièrement commentés.
- [Fichiers de données générés](/fr/pipeline/data-files) — ce qu'écrit
  chaque script, et ce qui est versionné vs. gitignoré.
