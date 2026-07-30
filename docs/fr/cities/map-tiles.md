# Générer les tuiles de carte

Nécessite Java 17+ (la première exécution télécharge Planetiler, ~150 Mo,
une seule fois) — ou Docker via `--docker`, aucune installation Java
nécessaire.

```bash
make tiles CITY=votre-ville
```

Sortie : `data/cities/votre-ville/tiles.pmtiles` (~20–80 Mo selon la
taille de la ville). Une fois généré, mettez à jour `offlineMb` dans
`config/cities/votre-ville.json` pour correspondre à la taille du fichier
en mégaoctets.

## Utiliser un extrait régional

Par défaut, ceci télécharge et lit l'extrait OSM du *pays entier* —
Planetiler doit quand même parser tout le fichier d'entrée même si
`--bounds` ne fait que rogner la sortie, donc c'est correct pour un petit
pays et inutilement lent pour un grand. Si le fournisseur de données du
pays publie aussi des extraits régionaux/d'état plus petits, pointez-en un
directement à la place :

```bash
python3 pipeline/generate_pmtiles.py votre-ville --docker \
  --osm-path data/.cache/votre-region.osm.pbf
```

L'existence d'une telle division dépend entièrement du fournisseur de
données du pays (Geofabrik, le plus souvent). Deux exemples concrets de
villes installées pendant la construction de ce framework :

- **L'Espagne** se divise par communauté autonome. Bilbao a utilisé
  `pais-vasco-latest.osm.pbf` (68 Mo) plutôt que toute l'Espagne (1,4 Go),
  réduisant la génération de tuiles de plusieurs minutes à environ 90
  secondes.
- **La Suisse** ne se divise pas davantage — son fichier pays unique
  (539 Mo) est ce que pointerait de toute façon un `--osm-path` pour une
  ville suisse, ce qui vaut quand même la peine de le faire explicitement
  plutôt que de supposer qu'une division existe et qu'il faudrait
  chercher.

## Lancer les générations de tuiles une par une

Deux exécutions de Planetiler partageant `data/tmp` comme répertoire de
travail corrompront la sortie l'une de l'autre — lancer deux invocations
de `generate_pmtiles.py` en parallèle (même pour des villes différentes)
n'est pas sûr. Lancez-les séquentiellement.

## Suite

[Vérifier votre ville](/fr/cities/verifying-your-city) — vérifier les
données générées et une vraie requête de routage avant de toucher à
l'interface.
