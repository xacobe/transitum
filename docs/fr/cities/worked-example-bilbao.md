# Exemple complet : Bilbao

Bilbao est l'exemple multimodal propre au framework — quatre opérateurs,
quatre modes (bus, métro, tram, funiculaire), fusionnés à partir de quatre
flux GTFS officiels séparés avec `pipeline/import_gtfs_multi.py`.

## Les sources

```json
"transitSources": [
  {
    "type": "official-gtfs",
    "url": "https://ctb-gtfs.s3.eu-south-2.amazonaws.com/bilbobus.zip",
    "agencyIds": { "Bilbobus": "BILBOBUS" }
  },
  {
    "type": "official-gtfs",
    "url": "http://www.metrobilbao.eus/imports/google_transit.zip",
    "agencyIds": { "Metro Bilbao": "METRO" }
  },
  {
    "type": "official-gtfs",
    "url": "ftp://ftp.geo.euskadi.net/cartografia/Transporte/Moveuskadi/Euskotren/google_transit.zip",
    "agencyIds": {
      "ES:Euskotren:Operator:EUS_TrBi:": "TRANVIA",
      "ES:Euskotren:Operator:EUS_Funi:": "FUNICULAR"
    }
  },
  {
    "type": "official-gtfs",
    "url": "ftp://ftp.geo.euskadi.net/cartografia/Transporte/Moveuskadi/Bizkaibus/google_transit.zip",
    "agencyIds": { "200": "BIZKAIBUS" },
    "routeShortNames": ["A3247"]
  }
]
```

Chaque source est un opérateur unique, donc aucune restriction
`routeTypes`/`stopsWithinBbox` n'a été nécessaire pour trois d'entre
elles — Bilbobus, Metro Bilbao et le tram+funiculaire d'Euskotren sont
chacun déjà à l'échelle de la ville. L'exception est Bizkaibus : un
opérateur de bus provincial couvrant toute la Biscaye, dont une seule
ligne (`A3247`, le bus aéroport) appartient à l'exemple Bilbao —
`routeShortNames` n'en garde qu'une seule sur une centaine.

## Deux problèmes de données, pas zéro

Les flux de Bilbao ne sont pas non plus parfaitement propres — deux vrais
problèmes sont apparus et sont gérés par configuration, pas en corrigeant
les données à la main :

- **Le flux de Metro Bilbao a un seul `route_id` pour tout son réseau**
  (L1 et L2). `lineOverrides` le divise en lignes réellement connues des
  usagers, dérivées du nommage propre du `shape_id` du flux plutôt que
  devinées à partir d'un schéma — voir
  [Diviser des lignes interlignées](/fr/cities/line-overrides).
- **Les couleurs propres au tram/funiculaire d'Euskotren et le
  `route_short_name` vide de Metro Bilbao** ont nécessité les replis déjà
  existants du pipeline (repli sur le nom long pour un nom court vide,
  repli sur la palette par hash pour une agence qui publie la même couleur
  sur toutes ses lignes) plutôt que quelque chose de spécifique à Bilbao.

## Résultat

Régénérez et vérifiez le mélange de modes après chaque changement :

```bash
python3 -c "
import json
from collections import Counter
data = json.load(open('data/cities/bilbao/routes.json'))
print(Counter(r.get('mode', 'bus') for r in data))
"
# Counter({'bus': 47, 'metro': 2, 'funicular': 1, 'tram': 1})
```

::: tip
Les chiffres ci-dessus sont une photo à un instant donné — recoupez-les
avec `config/cities/bilbao.json` et `data/cities/bilbao/routes.json`
directement pour l'état actuel, car les deux évoluent en même temps que
les flux source.
:::

## Pourquoi cet exemple embarque `tiles.pmtiles`

`timetable.<hash>.bin`, `patterns.json`, `stops.bin` et `tiles.pmtiles`
sont normalement gitignorés et régénérés localement — reproductibles à
partir des données source versionnées, cela ne vaut pas la peine de les
commiter pour une ville en production (voir
[Fichiers de données générés](/fr/pipeline/data-files)). Un exemple est
différent : c'est déjà, par conception, une photo figée dans le temps, tout
comme le GTFS qu'il embarque (les horaires dériveront à mesure que les
vrais opérateurs mettent à jour leurs flux — c'est attendu, pas un bug).
Le `tiles.pmtiles` de Bilbao (8,4 Mo, ne se compresse pas davantage —
PMTiles est déjà compressé en interne) est commité selon la même
logique : montrer toute l'application fonctionner, carte comprise, juste
après `make use-example`, l'emporte sur le coût d'une photo de plus, figée
par conception.

## Voir aussi

- [Imports multi-source](/fr/cities/multi-source) — la référence générale
  pour chaque filtre utilisé ci-dessus, plus un second exemple complet
  (Zürich) qui couvre `routeTypes`/`stopsWithinBbox`/`collapseRouteIdsBy`,
  dont les sources de Bilbao n'ont pas besoin.
- [Diviser des lignes interlignées](/fr/cities/line-overrides) — le
  mécanisme complet de `lineOverrides`.
