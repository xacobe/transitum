# Introduction

Transitum est un framework d'application web progressive pour le transport
public, conçu pour permettre d'explorer et de parcourir le réseau de
transport d'une ville — arrêts à proximité, plans de lignes, planification
d'itinéraires multi-étapes — hors ligne et optimisé pour les connexions
2G/3G et les téléphones d'entrée de gamme.

Il est livré sans aucune ville préconfigurée — `config/cities/` est vide par
défaut. Ajouter une vraie ville est une tâche de données, pas un changement
de code : pointez le pipeline vers des tags OpenStreetMap ou un vrai flux
GTFS, et le frontend, le moteur de routage hors ligne et les tuiles de carte
s'adaptent automatiquement.

## À qui s'adresse ce framework

Une ville, une agence de transport ou un groupe civic-tech qui veut une
application de transport sans en construire une de zéro, dans un contexte
où :

- la connectivité est peu fiable ou coûteuse (2G/3G, données limitées)
- aucun opérateur ne publie la position des véhicules en temps réel
- les horaires sont soit un vrai flux GTFS, soit rien de plus précis qu'un
  « bus environ toutes les 15 minutes »

## Fonctionnalités

- **Arrêts à proximité** — arrêts de bus les plus proches sur une carte interactive et en vue liste
- **Planification d'itinéraires** — itinéraires multi-étapes avec segments de marche, jusqu'à 5 alternatives Pareto-optimales ; recherche avancée pour une date/heure précise, sensible au jour de la semaine (lun-ven/samedi/dimanche), en ligne comme hors ligne (voir [Architecture hors ligne](/fr/guide/offline-architecture))
- **Navigateur de lignes** — liste complète des lignes avec plan de trajet et chronologie des arrêts pour chaque direction
- **Favoris** — arrêts et itinéraires enregistrés, persistés localement
- **Mode hors ligne** — le pack de ville (tuiles de carte vectorielles, binaires de routage, liste des arrêts, POI) fonctionne entièrement hors ligne après le premier chargement
- **Horaires réels ou estimés** — affiche les prochains départs réels pour les lignes ayant un horaire publié, avec repli vers une estimation « Fréquent / Peu fréquent » pour les villes synthétiques OSM sans horaire réel, par ligne (une même ville/flux peut combiner les deux)
- **Multi-ville** — ville détectée automatiquement par GPS au premier lancement ; changeable manuellement depuis les Réglages
- **Filtrage multimodal** — filtre le navigateur de lignes et la planification d'itinéraires par mode de transport (bus, métro, tram, train, ferry, ...) quand une ville en a plus d'un
- **Interface multilingue** — i18n complète (`frontend/src/i18n/locales/`), chaque déploiement choisit sa langue par défaut et le sous-ensemble actif via `.env`
- **Thème clair / sombre**
- **Signalements d'incidents** — bouton de signalement contextuel sur les arrêts et les lignes, avec PocketBase en backend

## Contenu de cette documentation

- **[Ajouter une ville](/fr/cities/)** — le travail de données : OSM
  synthétique vs. GTFS officiel, fusion de plusieurs flux d'opérateurs,
  génération des tuiles de carte, et un exemple complet.
- **[Référence du pipeline](/fr/pipeline/)** — le schéma de configuration
  de ville et ce que produit chaque script du pipeline.
- **[Déploiement](/fr/deployment/)** — faire tourner votre propre instance,
  la personnaliser, et rester synchronisé avec les mises à jour du framework.
- **[Contribuer](/fr/contributing/)** — dette technique connue et comment
  le projet est structuré pour les contributions.
