# Démarrage rapide

**Prérequis :** Node.js 22+, Python 3.12+, Docker

```bash
cp config/.env.example config/.env   # renseignez les secrets (voir .env.example pour toutes les variables)
make install                          # npm ci à la racine du repo (npm workspaces : frontend + pipeline)
make use-example COUNTRY=spain        # config/cities/ est vide par défaut — ceci installe une ville fonctionnelle
make dev                              # serveur de dev frontend → http://localhost:5173
```

Le serveur de dev redirige `/routing/*` vers le service de routage Docker.
Démarrez-le avec :

```bash
docker compose --env-file config/.env up routing-serve
```

## Essayer l'application

`config/cities/` est vide par défaut — aucune ville, aucune donnée de
transport intégrée. Le moyen le plus rapide de voir l'application
fonctionner :

```bash
make use-example COUNTRY=spain             # Bilbao : 4 opérateurs, 4 modes, vrais horaires GTFS officiels
make use-example COUNTRY=burkina-faso      # trois villes, horaires reconstruits depuis OSM
make use-example COUNTRY=burkina-faso CITY=ouagadougou   # une seule ville d'un exemple multi-ville
```

Chacune copie un `<slug>.json` prêt à l'emploi dans `config/cities/`, ainsi
que ses données GTFS/JSON pré-générées dans `data/` — aucun besoin de
récupérer OSM ou un GTFS en direct. Les deux exemples fournissent aussi un
`tiles.pmtiles` pré-généré par ville, donc la carte s'affiche immédiatement
sans étape `make tiles` supplémentaire. Voir `examples/<pays>/README.md`
pour ce que chacun démontre.

Pour ajouter une vraie ville à la place, voir [Ajouter une ville](/fr/cities/).

## Mettre à jour depuis l'upstream

Un déploiement est un simple `git clone` de ce repo, pas un fork d'un
package publié — vous récupérez les améliorations du framework par des
merges, de la même façon que vous mergeriez n'importe quelle autre branche.
Voir [Mettre à jour depuis l'upstream](/fr/deployment/updating-from-upstream)
pour la configuration complète et le contrat de propriété des fichiers qui
garde les merges sans conflit.
