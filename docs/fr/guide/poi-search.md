# Recherche de POI

La recherche de destination est entièrement locale — les arrêts de bus et
les POI sont indexés en une seule passe MiniSearch sur l'appareil. Aucun
géocodeur externe. Fonctionne hors ligne.

Les POI proviennent de `pois.json` (~120 Ko gzippé dans l'exemple Bilbao,
~5 600 lieux) généré à partir d'OpenStreetMap. Chaque POI a un champ `tier`
utilisé pour le classement par pertinence :

| Tier | Contenu | Clés OSM |
|---|---|---|
| 1 | Hôpitaux, cliniques, marchés, universités, quartiers, stations de transport | `amenity`, `place`, `healthcare=hospital` |
| 2 | Banques, pharmacies, écoles, hôtels, stations-service, police, bibliothèques, parcs, musées, sites historiques, bâtiments gouvernementaux | `amenity`, `tourism`, `leisure`, `historic`, `healthcare`, `government` |
| 3 | Commerces, restaurants, bureaux, lieux de culte, loisirs, autres aménités | `shop`, `office`, `amenity`, `tourism`, `leisure`, `healthcare` |

Le workflow `data-sync-pois.yml` régénère et déploie `pois.json` pour
toutes les villes actives le 1er de chaque mois.
