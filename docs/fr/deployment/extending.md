# Étendre un déploiement

Ajouter du comportement — une nouvelle vue, un élément de navigation
supplémentaire, un backend de signalements/analytics différent, … — a sa
propre échappatoire prévue, séparée du
[restylage](/fr/deployment/theming). Copiez
`frontend/src/custom/index.example.ts` vers
`frontend/src/custom/index.ts` et renseignez ce dont vous avez besoin :

```bash
cp frontend/src/custom/index.example.ts frontend/src/custom/index.ts
```

`custom/index.ts` n'est jamais lu par les commits propres au framework —
c'est votre fichier, commitez-le dans votre propre `origin`. S'il
n'existe pas, l'application se comporte exactement comme si le fichier
était vide ; rien n'est requis pour l'activer.

## Le contrat

Il exporte un unique appel `defineCustomization({ ... })` (voir
`frontend/src/customization/contract.ts` pour le contrat typé complet) :

| Champ | Ajoute |
|---|---|
| `routes` | Routes Vue Router supplémentaires, ajoutées après celles propres au framework. Utilisez des composants paresseux (`() => import(...)`) — ce module est intégré dans le chunk d'entrée. |
| `routePaths` | Redéfinit le chemin URL d'une route du framework (`{ home: '/carte', settings: '/reglages', stop: '/arret/:stopId', ... }` — voir `FrameworkRouteName` pour la liste complète des noms redéfinissables). Les chemins propres au framework sont en anglais simple, sans traduction intégrée — les *noms* de route ne changent jamais, donc c'est la seule chose à toucher si la langue principale de votre déploiement n'est pas l'anglais. Conservez le segment `:param` d'une route s'il en a un. |
| `navItems` | Éléments de navigation du bas supplémentaires, ajoutés après les 4 propres au framework. Un élément supplémentaire tient bien ; davantage devient serré sur les écrans étroits. |
| `install(app)` | S'exécute une fois, après l'installation de Pinia/router/i18n et avant l'initialisation des propres stores du framework — enregistrez ici des plugins/stores Pinia supplémentaires ou utilisez `mergeLocaleMessage()`. |
| `analytics` | Un puits supplémentaire qui reçoit chaque appel `track()` en plus d'Umami. Pour remplacer complètement Umami, laissez aussi `VITE_ANALYTICS_URL`/`VITE_ANALYTICS_WEBSITE_ID` vides. |
| `submitReport` | Remplace le backend de signalements PocketBase par défaut. Le framework garde la responsabilité de l'interface d'envoi/envoyé/erreur autour de l'appel — levez une exception pour signaler un échec. Notez que le panneau d'administration adossé à PocketBase (`/admin`) lit directement depuis PocketBase, donc un déploiement qui remplace `submitReport` gère sa propre boîte de réception de signalements. |

Le champ `version: 1` est le mécanisme de montée de version : si une
future version du framework nécessite un changement cassant à ce contrat,
elle incrémente la version acceptée, et votre `custom/index.ts` échoue au
typecheck juste après le prochain `git merge upstream/main` — bruyamment,
au moment du build — au lieu de casser silencieusement au runtime.

## Pourquoi pas des hooks ou du shadowing de composants

Volontairement **pas** un système de hooks et d'événements à la
Drupal/WordPress, et volontairement **pas** de shadowing de composants
(un fichier au même chemin qui remplace silencieusement un composant du
framework) — cette surface d'export explicite, petite et versionnée est un
contrat stable à travers les merges `upstream` ; le shadowing risque de
diverger silencieusement d'un composant du framework qui a depuis changé,
sans rien pour le signaler. Un nom de route qui entre en collision avec
une route du framework est ignoré avec un avertissement en console (dev
uniquement) plutôt que de remplacer silencieusement la vue du framework.

Des emplacements d'interface nommés à l'intérieur de vues spécifiques du
framework (par ex. un `<slot>` dans le panneau de détail d'arrêt) sont une
version plus granulaire de la même idée, ajoutables par vue seulement
quand un vrai besoin se présente — chacun est une API que le framework
doit ensuite maintenir stable pour toujours, donc cela ne vaut pas la
peine de les semer préventivement partout.
