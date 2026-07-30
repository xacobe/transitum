# Mettre à jour depuis l'upstream

Un déploiement est un simple `git clone` de ce repo, pas un fork d'un
package publié — vous récupérez les améliorations du framework par des
merges, de la même façon que vous mergeriez n'importe quelle autre
branche.

## Configuration initiale

```bash
git clone <url-de-ce-repo> mon-deploiement
cd mon-deploiement
git remote rename origin upstream    # ce repo devient "upstream"...
git remote add origin <url-de-votre-propre-repo>   # ...et votre propre repo devient "origin"
```

## Récupérer les mises à jour plus tard

```bash
git fetch upstream
git merge upstream/main
```

Cela ne reste sans conflit que tant que vos propres commits et ceux du
framework ne touchent jamais les mêmes fichiers — voir le tableau de
propriété ci-dessous. Si `git merge` signale un conflit dans un fichier
propre au framework, c'est le signe que vous (ou un contributeur
précédent) avez édité quelque chose qui ne devait pas l'être ; résolvez-le
en faveur de l'upstream et déplacez ce dont vous aviez besoin vers un
fichier propre à votre déploiement à la place (`config/theme.css`,
`docker-compose.override.yml`, etc.)

## Ce qui vous appartient vs. ce qui appartient au framework

| | Appartient à votre déploiement | Appartient au framework |
|---|---|---|
| **Données de ville** | `config/cities/*.json` (`_countries.json` aussi), `data/` | `config/cities/*.example.jsonc`, `config/*.example.*`, `examples/` |
| **Secrets/config** | `config/.env*` (sauf `.env.example`) | `config/.env.example` |
| **Style** | `config/theme.css` | `frontend/src/styles/tokens.css`, tout le reste sous `frontend/src/` |
| **Assets de marque** | `frontend/public/logo/`, `frontend/public/icons/` (générés par `make icons` depuis `VITE_THEME_COLOR`, non commités par le framework) | — |
| **Comportement** | `frontend/src/custom/` (routes/éléments de nav/backends supplémentaires — copier `custom/index.example.ts` vers `custom/index.ts` pour activer) | `frontend/src/customization/`, `frontend/src/custom/index.example.ts` |
| **Ajustements d'infra** | `docker-compose.override.yml` (gitignoré — le moyen prévu d'ajouter/changer des services, ports, volumes par déploiement sans toucher à `docker-compose.yml` lui-même) | `docker-compose.yml`, `deploy/nginx/default.conf.template` |
| **Tout le reste** | — | `pipeline/`, `Makefile`, `package.json` / `pipeline/package.json`, `.github/workflows/`, `docs/` |

Règle générale : si c'est déjà sous contrôle de version dans *ce* repo et
que ce n'est pas l'une des échappatoires `.example`/`.override`
ci-dessus, traitez-le comme propre au framework — éditez-le en amont
(envoyez une PR) plutôt que dans votre propre déploiement, sinon chaque
futur `git merge upstream/main` entrera à nouveau en conflit dessus. Voir
[Personnaliser l'apparence d'un déploiement](/fr/deployment/theming) et
[Étendre un déploiement](/fr/deployment/extending) pour les deux moyens
prévus de personnaliser le comportement/l'apparence sans toucher du tout
aux fichiers du framework.
