# Déploiement

Node/npm ne sont pas installés sur le serveur — le build s'exécute
toujours en local, puis est synchronisé. Les commandes ci-dessous
utilisent `~/app` comme répertoire de projet distant — choisissez ce que
vous voulez, il doit juste correspondre à l'endroit où vous clonez ce repo
sur le serveur. Les workflows CI
(`.github/workflows/data-sync-*.yml`) lisent le même chemin depuis une
variable de repo `DEPLOY_PATH` (Settings → Actions → Variables), avec
`~/app` par défaut si non défini — définissez-la une fois là-bas plutôt
que d'éditer les fichiers de workflow.

## Changements frontend

```bash
make build
rsync -az --delete frontend/dist/  root@<serveur>:~/app/frontend/dist/
rsync -az            data/cities/   root@<serveur>:~/app/data/cities/
ssh root@<serveur> 'cd ~/app && docker compose restart web'
```

## Changements du service de routage

```bash
rsync -az services/routing/ root@<serveur>:~/app/services/routing/
ssh root@<serveur> 'cd ~/app && docker compose build routing-serve && docker compose up -d routing-serve'
```

## Changements de configuration nginx

`deploy/nginx/default.conf.template` est rendu par le propre entrypoint de
nginx au démarrage du conteneur (`${DOMAIN}` depuis `config/.env` — voir
le commentaire d'en-tête du template), donc un changement de config
nécessite juste un redémarrage, pas un rebuild :

```bash
rsync deploy/nginx/default.conf.template root@<serveur>:~/app/deploy/nginx/default.conf.template
ssh root@<serveur> 'cd ~/app && docker compose restart web'
```

## Interface d'administration PocketBase

L'interface d'administration PocketBase (`/_/`) n'est jamais exposée
publiquement — nginx ne proxifie que `/pb/api/`. Y accéder via un tunnel
SSH :

```bash
ssh -L 8090:localhost:8090 root@<serveur>
# puis ouvrir http://localhost:8090/_/ dans votre navigateur
```

## Suite

- **[Variables d'environnement](/fr/deployment/environment-variables)** —
  `config/.env`, ce qui est requis vs. optionnel.
- **[Personnaliser l'apparence d'un déploiement](/fr/deployment/theming)** —
  restylage et couleurs par ligne sans toucher aux fichiers propres au
  framework.
- **[Étendre un déploiement](/fr/deployment/extending)** — ajouter des
  routes, des éléments de navigation, ou remplacer le backend
  d'analytics/signalements.
- **[Analytics](/fr/deployment/analytics)** — le tableau de bord Umami et
  exclure votre propre navigateur.
- **[Mettre à jour depuis l'upstream](/fr/deployment/updating-from-upstream)** —
  rester synchronisé, et ce qui vous appartient vs. ce qui appartient au
  framework.
