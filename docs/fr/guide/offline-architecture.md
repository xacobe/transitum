# Architecture hors ligne

L'application a deux couches de cache avec des moments de téléchargement
distincts.

## Couche 1 — Coquille applicative (automatique, à la première visite)

Le Service Worker met en cache l'intégralité du bundle applicatif dès le
premier chargement : tous les chunks JS/CSS/HTML, le binaire WASM de
Minotor (l'algorithme de routage), et les assets statiques. Aucune action
utilisateur requise. Après cela, l'interface de l'application fonctionne
sans connexion réseau.

## Couche 2 — Pack de ville (explicite, déclenché par l'utilisateur depuis les Réglages)

Quand l'utilisateur appuie sur « Télécharger la ville », les fichiers
suivants sont récupérés et stockés localement, dans cet ordre :

| Fichier | Taille | Stockage | Usage |
|---|---|---|---|
| `tiles.pmtiles` | 4–80 Mo | IndexedDB (Blob) | Tuiles de carte vectorielles — la carte fonctionne hors ligne |
| `routes.json` | ~1 Mo | Cache API | Géométries de lignes pour la carte et le routage hors ligne |
| `routes-meta.json` | ~300 Ko | Cache API | Métadonnées de lignes pour les panneaux de détail d'arrêt |
| `stops.json` | ~200 Ko | Cache API | Liste des arrêts, préchargée pour la recherche hors ligne |
| `pois.json` | ~90 Ko | Cache API | Points d'intérêt, préchargés pour la recherche hors ligne |
| `patterns.json` | ~0,3–1,5 Ko | IndexedDB | Plan jour de semaine → pattern de service (voir ci-dessous) |
| `timetable.<hash>.bin` | ~90–380 Ko **chacun** | IndexedDB | Binaire de routage Minotor, un par pattern de service distinct |
| `stops.bin` | ~7–35 Ko | IndexedDB | Binaire des coordonnées d'arrêts Minotor (partagé par tous les patterns) |
| Glyphes Noto Sans | ~2 Mo | Cache API | Polices des étiquettes de carte depuis le CDN OpenFreeMap |

La barre de progression ne suit que `tiles.pmtiles` (la taille dominante).
Les autres fichiers se téléchargent en parallèle une fois les tuiles
terminées.

## Patterns de calendrier

Le calendrier GTFS d'une ville peut définir plusieurs patterns de service
distincts par jour de semaine — par exemple le flux fusionné de Bilbao
fonctionne selon quatre horaires réellement différents : lun-jeu, vendredi,
samedi et dimanche. `pipeline/generate_transit_data.mjs` génère un horaire
Minotor par jour de semaine (la prochaine occurrence de chacun depuis la
date d'exécution du pipeline) et **déduplique par hash de contenu** avant
d'écrire quoi que ce soit : les jours identiques fusionnent en un seul
`timetable.<hash>.bin`, et `patterns.json` associe chaque jour de semaine
au hash qui le modélise.

Cela signifie que le coût hors ligne évolue avec la variation réelle du
calendrier d'une ville, pas avec un nombre fixe de fichiers :

- Les **villes synthétiques OSM** (basées sur la fréquence, sans calendrier
  publié réel — toutes les villes d'`examples/burkina-faso`) fusionnent
  toujours en exactement **un** pattern. Zéro téléchargement supplémentaire
  par rapport à un horaire fixe unique.
- Les **villes en vrai GTFS** produisent typiquement 2 à 4 patterns
  distincts. Mesuré sur le flux Bilbao d'`examples/spain` : 4 patterns,
  ajoutant **~0,9 Mo** au pack de ville (348 Ko → 1,24 Mo de binaires de
  routage).

`patterns.json` liste aussi les `exceptionDates` — des dates avec une
exception `calendar_dates.txt` (jours fériés, déviations planifiées) non
reflétées dans les patterns de jour de semaine ci-dessus. La recherche
avancée signale ces dates dans l'interface et nécessite une connexion en
direct pour elles ; les patterns hors ligne par jour de semaine ne sont pas
garantis corrects à ces dates précises. Cela corrige aussi un bug
préexistant : l'ancien design à horaire unique figeait le jour où le
pipeline s'était exécuté pour la dernière fois, sans planification de
régénération fiable — un déploiement en production pouvait ainsi afficher
silencieusement l'horaire d'un jour de semaine un dimanche, pendant des
semaines. Choisir un pattern par jour de semaine au moment de la *requête*
élimine entièrement cette fenêtre d'obsolescence.

## Routage : en ligne vs. hors ligne

| État | Chemin de routage | Appel serveur ? |
|---|---|---|
| Pack de ville téléchargé | WASM (Minotor) lit `timetable.<hash>.bin` + `stops.bin` locaux pour le jour de semaine de la date demandée | Non — économise les données mobiles |
| Pas de pack de ville, ou la date demandée est une exception connue | POST `/routing/plan` vers le serveur Node.js | Oui |

Quand des données locales sont présentes, **le WASM est préféré même en
ligne** — même algorithme, même source GTFS, même qualité de résultat, mais
sans aller-retour réseau. Le service de routage Node.js prend en charge les
utilisateurs qui n'ont pas téléchargé le pack de ville, et toute requête
pour une date signalée dans `exceptionDates`.

Les mises à jour de données (vérification de fraîcheur via `version.json`)
sont détectées en arrière-plan. Si le serveur a régénéré les données de
transport depuis le dernier téléchargement, une notification « Mise à jour
disponible » apparaît dans les Réglages — appuyer dessus retélécharge
uniquement `patterns.json`, les `timetable.<hash>.bin` référencés,
`stops.bin`, `routes.json` et `routes-meta.json` (pas les tuiles, qui
changent rarement).
