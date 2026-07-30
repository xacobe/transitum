# Ajouter une ville

Le framework est conçu pour qu'ajouter une ville ne nécessite qu'un
travail de données — aucun changement de code.

## 1. Générer le bloc de ville

`make add-city` interroge Nominatim pour les coordonnées et la bounding
box de la ville, écrit un `config/cities/<slug>.json` de départ, et ajoute
le slug à `VITE_CITIES` dans `config/.env` :

```bash
make add-city ARGS="--city Dakar --country Senegal --timezone Africa/Dakar --agency-name DDD"
```

Si `config/cities/<slug>.json` existe déjà, le script s'arrête avec une
erreur — éditez ce fichier directement pour mettre à jour une ville
existante.

Tous les flags disponibles :

| Flag | Requis | Défaut |
|---|---|---|
| `--city` | oui | — |
| `--country` | oui | — |
| `--timezone` | oui | — |
| `--agency-name` | oui | — |
| `--slug` | non | dérivé automatiquement du nom de la ville |
| `--agency-url` | non | `""` |
| `--agency-lang` | non | `fr` |
| `--service-start` | non | `06:00:00` |
| `--service-end` | non | `20:00:00` |

## 2. Relire et ajuster `config/cities/<slug>.json`

Ouvrez le nouveau fichier. Champs à vérifier :

- **`country`** — à définir sur une clé de l'objet `"countries"` de
  `config/cities/_countries.json`. Ajoutez-y une nouvelle entrée si
  besoin (voir [Générer les tuiles de carte](/fr/cities/map-tiles) pour le
  `geofabrikUrl` nécessaire).
- **`serviceStart` / `serviceEnd`** et **`frequencyPeriods`** — à ajuster
  selon les vraies plages horaires et fréquences du transport local. Les
  valeurs générées sont des défauts génériques.
- **`agencies`** — mettre à jour `agencyUrl` si connu.

Voir [Schéma de configuration de ville](/fr/pipeline/config-schema) pour la
référence complète des champs.

## 3. Choisir une source de données et l'importer

- **[OSM synthétique vs. GTFS officiel](/fr/cities/data-sources)** — lequel
  utiliser, et pourquoi préférer un vrai flux quand il en existe un. Couvre
  les cas simples : reconstruction depuis les tags OSM, ou import d'un seul
  flux officiel tel quel.
- **[Imports multi-source](/fr/cities/multi-source)** — fusionner les flux
  de plusieurs opérateurs en une seule ville, et restreindre un flux aux
  seules routes qui appartiennent à la ville (`routeShortNames`,
  `routeTypes`, `stopsWithinBbox`, `collapseRouteIdsBy`).
- **[Diviser des lignes interlignées](/fr/cities/line-overrides)** — un
  problème différent, plus rare : quand un flux modélise plusieurs lignes
  perçues par les usagers comme une seule route GTFS.

## 4. Générer les tuiles de carte

**[Générer les tuiles de carte](/fr/cities/map-tiles)** — tuiles
vectorielles depuis OSM, y compris utiliser un extrait régional plutôt
qu'un pays entier pour garder la génération rapide.

## 5. Vérifier

**[Vérifier votre ville](/fr/cities/verifying-your-city)** — vérifier les
données générées et interroger l'API de routage directement avant de
toucher à l'interface.

## 6. Construire et déployer

```bash
make build
make deploy
```

Le frontend et le serveur de routage prennent en compte les nouvelles
villes automatiquement — aucun changement de code nécessaire. Voir
[Déploiement](/fr/deployment/) pour la mise en production côté serveur
complète.

## Exemple complet

**[Exemple complet : Bilbao](/fr/cities/worked-example-bilbao)** — l'exemple
multimodal propre au framework, du début à la fin : quatre opérateurs,
quatre modes, deux problèmes de qualité de données résolus par
configuration.

## Installer vs. commiter comme exemple

Installer une ville et la commiter comme exemple permanent sont deux
décisions distinctes. Commiter signifie : les données sont livrées dans
chaque `git clone` du framework, elles sont couvertes par les workflows de
resynchronisation périodique (`data-sync-routes.yml`), et sa configuration
devient une référence à long terme dont s'inspirent les autres
déploiements. Cela vaut la peine pour une ville qui met en valeur quelque
chose que les exemples existants ne couvrent pas — pas seulement parce
qu'une ville était facile à installer. Une ville peut être entièrement
installée, testée et vérifiée dans une copie locale sans jamais être
commitée dans `examples/`.
