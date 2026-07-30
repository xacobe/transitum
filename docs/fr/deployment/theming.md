# Personnaliser l'apparence d'un déploiement

La séparation framework/déploiement ne reste fluide que si les
personnalisations propres à un déploiement ne touchent jamais les mêmes
fichiers que ceux commités par le framework lui-même — voir
[Mettre à jour depuis l'upstream](/fr/deployment/updating-from-upstream)
pour le contrat de propriété complet. Le restylage a une échappatoire
dédiée et prévue exactement pour cette raison.

## Restylage

Copiez `config/theme.css.example` vers `config/theme.css` et redéfinissez
les propriétés CSS personnalisées que vous voulez (couleurs de
l'application, polices, palette du fond de carte MapLibre) — chargé en
dernier via un module virtuel Vite, donc le framework n'a jamais besoin d'y
toucher et un clone neuf sans `theme.css` utilise simplement les valeurs
par défaut. Voir `frontend/src/styles/tokens.css` pour la liste complète
des tokens redéfinissables.

## Couleurs par ligne

La couleur du badge de chaque ligne se résout dans cet ordre :

1. Une redéfinition explicite dans `config/line-colors.json` (voir
   `config/line-colors.example.jsonc`)
2. Le propre `route_color` officiel de la source GTFS, si la ville a opté
   pour cette option (`useOfficialLineColors` dans la config de la ville)
3. Une palette de repli déterministe basée sur un hash, pour que chaque
   ligne obtienne quand même une couleur stable et distincte sans aucune
   configuration

`make line-colors CITY=slug` amorce une entrée de départ par ligne
(quelle que soit la couleur affichée aujourd'hui) dans
`config/line-colors.json` — modifiez ou supprimez celles que vous voulez ;
relancer la commande ne fait que renseigner les lignes qui n'ont pas
encore d'entrée, sans jamais toucher à ce que vous avez déjà changé. Le
code du framework n'écrit plus jamais dans ce fichier après l'amorçage
initial, donc il est à vous de le commiter dans votre propre `origin`,
comme `config/cities/`.
