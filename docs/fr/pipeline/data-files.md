# Fichiers de données générés

Chaque ville produit, sous `data/cities/<slug>/` :

| Fichier | Contenu | Versionné ? |
|---|---|---|
| `stops.json` | Liste des arrêts | Oui |
| `routes.json` | Géométries de lignes + séquences d'arrêts | Oui |
| `routes-meta.json` | Métadonnées de lignes, sans géométrie (panneaux d'arrêt) | Oui |
| `pois.json` | Lieux nommés avec champ de niveau (tier) | Oui |
| `version.json` | Horodatage de version des données (invalidation du cache) | Oui |
| `patterns.json` | Plan jour de semaine → pattern d'horaire Minotor (voir [Architecture hors ligne](/fr/guide/offline-architecture)) | Non — régénérer localement |
| `timetable.<hash>.bin` | Binaire de routage Minotor, un par pattern de service distinct par jour de semaine | Non — régénérer localement |
| `stops.bin` | Binaire des arrêts Minotor | Non — régénérer localement |
| `tiles.pmtiles` | Tuiles de carte vectorielles | Non — régénérer localement |

Les fichiers binaires/manifestes gitignorés sont tous reproductibles à
partir de la source GTFS versionnée (`data/gtfs/<pays>/<ville>/` pour les
villes synthétiques OSM, `data/.cache/<slug>.gtfs.zip` pour les villes en
GTFS officiel) via `make data-common CITY=<slug>` et
`make tiles CITY=<slug>`.

Un exemple commité sous `examples/` peut déroger à cela — voir
[Exemple complet : Bilbao](/fr/cities/worked-example-bilbao#pourquoi-cet-exemple-embarque-tiles-pmtiles)
pour quand et pourquoi.

Voir [Structure du dépôt](/fr/guide/repository-layout) pour l'arborescence
complète dans laquelle cela s'inscrit.
