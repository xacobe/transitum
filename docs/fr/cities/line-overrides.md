# Diviser des lignes interlignées

Tout dans [Imports multi-source](/fr/cities/multi-source) restreint
*quelles* routes sont importées. Un problème séparé apparaît ensuite :
parfois un flux modélise plusieurs lignes que les usagers connaissent
séparément comme une seule route GTFS — le flux de Metro Bilbao est le cas
propre au framework, un seul `route_id` pour tout son réseau (L1 et L2
confondues), chaque trajet n'étant distinguable que par son
`trip_headsign`.

## Déduire la division à partir des données, pas d'un schéma

Ne devinez pas la division à partir d'un schéma de ligne ou de Wikipédia —
vérifiez d'abord le nommage propre du `shape_id` du flux, quand il en a
un. Celui de Bilbao s'est révélé encoder directement les paires
origine→destination :

```bash
awk -F',' '$1=="metro:MB" {print $4, $8}' trips.txt | sort -u
# Basauri metro:BID_BSR
# Basauri metro:KAB_BSR
# ...
```

Cela a aussi révélé quelque chose qu'un schéma n'aurait pas montré :
certains trajets traversent ce que les usagers appellent L1 et L2
(`Basauri→Plentzia`, `Etxebarri→Kabiezes`) via un tronc commun central —
pas un réseau à deux lignes bien séparées. L'étiquette réellement bien
définie par trajet est la *destination* (headsign), donc c'est sur cela
que se base `lineOverrides` : chaque headsign accessible depuis le côté
Plentzia est associé à « L1 », chaque headsign depuis le côté Kabiezes est
associé à « L2 », et un trajet traversant est étiqueté selon sa
destination réelle — ce qui correspond exactement à ce qu'un usager sur le
quai voit annoncé.

## Configuration

`lineOverrides` (dans `config/cities/<slug>.json`) divise une route en
lignes numérotées séparément que les usagers connaissent réellement,
indexées par agence puis par headsign exact. Un headsign absent du mapping
garde le nom propre de la route au lieu d'être écarté, donc le mapping n'a
jamais besoin d'être exhaustif pour être sûr :

```json
"lineOverrides": {
  "METRO": {
    "Plentzia":       { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Sopela":         { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Larrabasterra":  { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Ibarbengoa":     { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Etxebarri":      { "shortName": "L1", "longName": "Etxebarri - Plentzia" },
    "Basauri":        { "shortName": "L2", "longName": "Basauri - Kabiezes" },
    "Kabiezes":       { "shortName": "L2", "longName": "Basauri - Kabiezes" },
    "San Ignazio":    { "shortName": "L2", "longName": "Basauri - Kabiezes" }
  }
}
```

Voir `config/cities/example-city-b.example.jsonc` pour le schéma complet
et commenté.

## Pourquoi les résultats de routage nécessitent une correction séparée

Cette configuration ne corrige à elle seule que le navigateur de lignes
statique. Les vrais résultats de routage passent par Minotor, dont le
propre modèle de route ne porte qu'un `shortName` + un mode et rien
d'autre — pas de headsign, aucun moyen de savoir de quel côté d'un
override appartient un trajet donné.

Le `findRouteInfo` de `buildSyntheticItinerary` (dans
`services/routing/minotorHelpers.js`) gère cela en repliant sur une
correspondance par arrêt le plus proche par rapport à la liste d'arrêts de
chaque ligne candidate, chaque fois que le `shortName` seul ne tombe pas
sur exactement une entrée de `routes.json` — le même signal déjà utilisé
pour faire correspondre un segment à sa géométrie sur la carte. Aucune
configuration nécessaire pour cette partie ; elle est automatique dès que
`lineOverrides` (ou un `route_short_name` vide sans aucun override) rend
ambiguë la simple correspondance par shortName.
