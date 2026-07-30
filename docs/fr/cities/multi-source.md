# Imports multi-source

Certaines villes répartissent leur transport entre des opérateurs séparés
qui publient chacun leur propre flux — une compagnie de bus, un opérateur
de métro, un opérateur de tram/train — sans portail unique les
rassemblant. `pipeline/import_gtfs_multi.py` fusionne plusieurs sources en
une seule ville.

Contrairement à `import_gtfs.py` (qui prend `--url` en ligne de commande),
celui-ci lit sa liste de sources depuis le propre
`config/cities/<slug>.json` de la ville :

```bash
python3 pipeline/import_gtfs_multi.py --city votre-ville
```

## Trouver la ou les sources

Vérifiez, dans l'ordre :

1. Le portail open-data propre à la ville ou à la région (cherchez
   « `<ville>` open data GTFS » ou « `<ville>` opendata portal »).
2. Un point d'accès national — les pays de l'UE sont tenus d'en publier
   un ; cherchez « `<pays>` national access point transport ».
3. Un catalogue de flux : [mobilitydatabase.org](https://mobilitydatabase.org)
   ou [transit.land](https://transit.land).

**Une seule source signifie rarement un seul flux.** Un gros opérateur
multimodal ou une autorité régionale regroupe souvent tout dans un seul
GTFS — c'est *une bonne chose* (un seul téléchargement, une seule entrée de
config) mais cela veut dire que l'étape suivante consistera à déterminer
quelles parties de ce flux unique appartiennent réellement à votre ville.

## Inspecter avant de valider

N'écrivez pas encore la config. Décompressez le ou les flux et vérifiez
trois choses — c'est là que se prennent les vraies décisions.

**Combien d'agences, et comment les routes sont-elles réparties entre elles ?**

```bash
unzip -p feed.zip agency.txt
unzip -p feed.zip routes.txt | awk -F',' '{print $NF}' | sort | uniq -c   # histogramme approximatif des route_type ; ajustez la colonne
```

Le flux VBZ/ZVV de Zürich illustre bien ce qu'on peut y trouver : une
*seule* agence (`Zürcher Verkehrsverbund`) — le cas d'agence implicite de
GTFS (voir comment `import_gtfs_multi.py` le gère, ajouté à l'origine pour
Metro Bilbao) — couvrant quatre types de route : 21 trams, 3 lignes de
train S-Bahn, 3 funiculaires, et **367 lignes de bus**.

**Quelle zone géographique chaque mode couvre-t-il réellement ?** Un
simple nombre de routes ne dit pas si un mode est à l'échelle de la ville
ou régional. Vérifiez les coordonnées des arrêts, groupées par mode :

```python
import zipfile, csv, io
from collections import defaultdict

with zipfile.ZipFile("feed.zip") as zf:
    routes = list(csv.DictReader(io.TextIOWrapper(zf.open("routes.txt"), encoding="utf-8-sig")))
    trips  = list(csv.DictReader(io.TextIOWrapper(zf.open("trips.txt"), encoding="utf-8-sig")))
    stops  = {r["stop_id"]: r for r in csv.DictReader(io.TextIOWrapper(zf.open("stops.txt"), encoding="utf-8-sig"))}
    stop_times = csv.DictReader(io.TextIOWrapper(zf.open("stop_times.txt"), encoding="utf-8-sig"))

    route_type_by_id = {r["route_id"]: r["route_type"] for r in routes}
    trip_type = {t["trip_id"]: route_type_by_id.get(t["route_id"]) for t in trips}

    bounds = defaultdict(lambda: [90, -90, 180, -180])  # minLat, maxLat, minLon, maxLon
    for st in stop_times:
        rt = trip_type.get(st["trip_id"])
        s = stops.get(st["stop_id"])
        if not rt or not s or not s.get("stop_lat"):
            continue
        lat, lon = float(s["stop_lat"]), float(s["stop_lon"])
        b = bounds[rt]
        b[0], b[1] = min(b[0], lat), max(b[1], lat)
        b[2], b[3] = min(b[2], lon), max(b[3], lon)

    for rt, b in bounds.items():
        print(rt, b)
```

Pour Zürich, c'est ce qui a tranché : tram + train + funiculaire réunis
couvraient environ 18×20 km (576 arrêts) — l'échelle d'une ville,
comparable à l'exemple Bilbao. Les 367 lignes de bus couvraient environ
58×50 km (5 827 arrêts) — le *canton entier*, pas la ville. Il n'y avait
aucun moyen au niveau agence de séparer « les bus urbains propres à VBZ »
du reste (chaque route partage la même agence), donc `routeTypes` seul ne
pouvait que garder tram/train/funiculaire et écarter les bus purement et
simplement.

Les bus ont fini par revenir, une fois trouvé un moyen de ne garder que
ceux qui atteignent la ville : `stopsWithinBbox` (ci-dessous) garde une
route si *au moins un* de ses arrêts tombe dans une boîte lat/lon donnée,
en utilisant la même boîte à l'échelle de la ville que celle utilisée pour
mesurer tram/train/funiculaire. Cela a gardé 186 des 367 — les routes qui
atteignent réellement Zürich, issues d'un réseau de bus qui, pour
l'essentiel, ne l'atteint pas.

C'est un jugement au cas par cas, pas une règle — la propre source
Bilbobus de Bilbao est gardée intégralement car il s'agit véritablement de
l'opérateur propre à la ville, pas d'un opérateur régional. La différence
est de savoir si les routes supplémentaires représentent la ville ou une
zone bien plus vaste portant le nom de la ville ; `stopsWithinBbox` existe
pour les cas intermédiaires, où les routes d'un même opérateur régional
sont un mélange des deux.

**La structure route/trajet a-t-elle l'air cohérente ?** Groupez par
`(agency_id, route_short_name)` et vérifiez que le compte est proche du
nombre brut de routes — un grand écart signifie que le flux modélise
quelque chose de façon inhabituelle (voir `collapseRouteIdsBy` ci-dessous).

## Écrire la configuration

```json
"transitSources": [
  {
    "type": "official-gtfs",
    "url": "https://exemple.org/operateur-bus/gtfs.zip",
    "agencyIds": { "<agency_id d'origine dans le flux>": "<agencyId déclaré>" },
    "routeShortNames": ["A3247"],
    "routeTypes": ["0", "2", "7"],
    "stopsWithinBbox": { "minLat": 0, "maxLat": 0, "minLon": 0, "maxLon": 0 },
    "collapseRouteIdsBy": "shortName"
  },
  {
    "type": "official-gtfs",
    "url": "https://exemple.org/operateur-metro/gtfs.zip",
    "agencyIds": { "Metro Co": "METRO" }
  }
]
```

`agencyIds` (`{"<agency_id dans ce flux>": "<agencyId déclaré>"}`)
renomme et filtre à la fois : toute agence du flux *non* listée comme clé
est écartée, ainsi que tout ce qui lui appartient exclusivement (routes,
trajets, arrêts, formes, calendrier). Chaque ID pouvant entrer en
collision entre sources (`route_id`, `trip_id`, `stop_id`, `shape_id`, ...)
est préfixé par source avant la fusion, donc deux opérateurs réutilisant
les mêmes IDs bruts ne se percutent jamais.

Quatre autres filtres sont disponibles par source, tous optionnels, tous
restreignant un ensemble déjà filtré par agence :

- **`routeShortNames`** — garder une ou plusieurs lignes précises par nom.
  Utilisé pour le bus aéroport de Bilbao : une ligne (`A3247`) parmi un
  opérateur provincial d'environ 100 routes (Bizkaibus).
- **`routeTypes`** — garder un ou plusieurs codes `route_type` GTFS
  précis (en chaînes de caractères — voir `GTFS_MODES` dans
  `pipeline/gtfs_routes_to_json.py` pour la liste complète, par ex. `"0"`
  tram, `"2"` train, `"7"` funiculaire). Pour une seule agence dont le
  flux est à l'échelle de la ville pour certains modes mais régional pour
  d'autres.
- **`stopsWithinBbox`** — garder une route si l'un de ses arrêts tombe
  dans une boîte lat/lon. La version plus difficile du même problème que
  résout `routeTypes` : un seul mode, une agence régionale, aucun pattern
  de nom court indiquant quelles routes atteignent la ville. Indépendant
  du `tileBbox`/`searchBbox` de la ville, qui doivent couvrir chaque mode
  gardé, pas seulement cette source — définissez-le explicitement ici.
- **`collapseRouteIdsBy: "shortName"`** — fusionne les routes partageant
  `(agency_id, route_short_name)` en une seule, *avant* que le
  regroupement direction/headsign propre au pipeline ne s'exécute. Corrige
  un défaut de flux plus rare : certaines conversions donnent à chaque
  départ programmé individuel son propre `route_id` au lieu de regrouper
  les départs d'une même ligne comme des trajets sous une route partagée
  (vu sur un flux de ferry suisse converti par geOps — 235 « routes » qui
  se sont révélées être **8 vraies lignes de bateau** une fois fusionnées ;
  un vrai GTFS n'en a jamais besoin). À n'activer que quand une source
  produit visiblement des lignes quasi dupliquées (vérifiez le nombre de
  routes dans `data/cities/<slug>/routes.json` après un premier import).

**La même URL peut apparaître dans deux sources, volontairement** — une
pour les modes à l'échelle de la ville (`routeTypes` seul les sépare), une
pour un mode qui a aussi besoin de `stopsWithinBbox`.
`import_gtfs_multi.py` télécharge et filtre chaque source indépendamment,
donc cela signifie simplement deux passes sur le même flux avec des
filtres différents — aucun cas particulier nécessaire, même si cela
signifie télécharger deux fois un gros flux, à garder en tête avant de le
faire pour quelque chose au-delà de ~100 Mo.

**Deux sources puisant dans le même flux peuvent redécouvrir
indépendamment le même arrêt physique** (un arrêt de bus qui est aussi un
arrêt de tram, par exemple) et chacune émettra sa propre copie avec un ID
préfixé identique une fois fusionnées — inoffensif au sens GTFS mais
quelque chose que le parseur de Minotor ne tolère pas (il suppose que
`stop_id` est unique, conformément à la spec). `import_gtfs_multi.py`
déduplique les lignes exactement dupliquées entre tous les fichiers
fusionnés précisément pour ce cas ; aucune configuration nécessaire, mais
si `make data-common` échoue un jour dans « Building stops adjacency
structure » après l'ajout d'une deuxième source issue du même flux, c'est
presque certainement la raison.

Les bounding boxes doivent couvrir chaque mode gardé, pas seulement le
cœur de la ville — un ferry de lac ou une ligne S-Bahn régionale peut
s'étendre bien au-delà de l'empreinte d'un réseau de tram. Élargissez
`searchBbox`/`tileBbox` si une étape ultérieure signale des arrêts ou une
route en dehors.

## Lancer l'import

```bash
python3 pipeline/import_gtfs_multi.py --city votre-ville
make data-common CITY=votre-ville
```

`import_gtfs_multi.py` télécharge chaque source, applique les filtres
ci-dessus, préfixe chaque ID référencé par source, et fusionne le
résultat. `data-common` régénère `routes.json`/`stops.json`/`pois.json`
et les binaires de routage Minotor à partir de ce GTFS fusionné.
Surveillez la sortie de la première commande — elle affiche le nombre de
routes/trajets/arrêts gardés par source, ce qui constitue un second
contrôle de cohérence moins coûteux que de réinspecter le flux brut :

```
Importing 3 source(s) for 'your-city'...
  downloading https://exemple.org/...
  [tag] kept 1 agency(ies), 27 routes, 60303 trips, 720 stops
  ...
Merged GTFS written to .../data/gtfs/<pays>/votre-ville (221 routes, 3518 stops)
```

Si le calendrier d'une source a déjà expiré au moment où vous lancez ceci
(vérifié contre l'horloge système réelle — voir le `today` de
`pipeline/generate_transit_data.mjs`), ce mode s'importera proprement mais
produira zéro trajet routable. Rien à corriger dans la config — cela se
résout de soi-même une fois que la source republie une fenêtre courante,
ou lors de la prochaine resynchronisation planifiée.

## Suite

- [Diviser des lignes interlignées](/fr/cities/line-overrides) — un
  problème différent : quand un flux modélise plusieurs lignes perçues par
  les usagers comme une seule route.
- [Vérifier votre ville](/fr/cities/verifying-your-city) — vérifier le
  résultat.
