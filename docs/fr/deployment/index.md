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

## Synchronisation automatique des données (optionnel)

`data-sync-routes.yml` et `data-sync-pois.yml` (voir [Référence du
pipeline](/fr/pipeline/#resynchronisation-automatique-ci) pour ce qu'ils
font réellement) supposent ce même mode de déploiement auto-hébergé SSH +
docker-compose, et sont désactivés par défaut — la planification
quotidienne/mensuelle ne se déclenche que si un déploiement active
explicitement l'option. Pour commencer à les utiliser :

1. Ajoutez des secrets de dépôt (Settings → Secrets and variables →
   Actions → Secrets) : `SSH_PRIVATE_KEY`, `SERVER_HOST`, `SERVER_USER` —
   ce sur quoi l'étape de déploiement se connecte en SSH.
2. Définissez `DEPLOY_PATH` comme variable de dépôt si ce n'est pas `~/app`.
3. Définissez `OSM_ROUTES_SYNC_ENABLED` et/ou `OSM_POIS_SYNC_ENABLED` à
   `true` (variables de dépôt) une fois prêt pour que la planification
   s'exécute réellement — ou laissez-les non définies et déclenchez une
   synchro ponctuelle manuellement depuis l'onglet Actions
   (`workflow_dispatch` fonctionne toujours, activé ou non).

Un mode de déploiement différent (pas SSH + docker-compose auto-hébergé)
implique d'écrire votre propre workflow de synchro plutôt que de réutiliser
ceux-ci — comme pour tout autre fichier CI appartenant au framework, voir
[Mettre à jour depuis l'upstream](/fr/deployment/updating-from-upstream).

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
