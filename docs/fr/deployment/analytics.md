# Analytics

Tableau de bord Umami à l'adresse pointée par `VITE_ANALYTICS_URL` pour
votre déploiement — événements personnalisés pour les recherches
d'itinéraire, les vues d'arrêt/ligne, les favoris, les changements de
ville.

Pour exclure votre propre navigateur du suivi :

```js
// Dans la console du navigateur, sur le propre domaine de votre déploiement
localStorage.setItem('umami.disabled', '1')
```

Pour remplacer complètement Umami par un autre backend d'analytics, voir
le champ `analytics` d'[Étendre un déploiement](/fr/deployment/extending#le-contrat).
