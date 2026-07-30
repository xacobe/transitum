# Contribuer

Le code du framework vit sous `pipeline/`, `frontend/src/` (en dehors de
`custom/`/`customization/`), `services/` et `.github/workflows/` — voir le
tableau de propriété de
[Mettre à jour depuis l'upstream](/fr/deployment/updating-from-upstream)
pour la répartition complète entre fichiers propres au framework et
propres au déploiement. Les changements sur l'un de ces éléments sont
bienvenus sous forme de PR contre `main`.

`ci.yml` s'exécute à chaque PR : typecheck + build pour le frontend, et
une passe de lint pour le pipeline.

## Problèmes connus

- **`useOfflineTiles.js`** — le seul fichier `.js` restant dans `src/`
  (334 lignes, 5 consommateurs). La conversion vers TypeScript est en
  attente : elle nécessite d'écrire à la main les définitions de types
  WASM de Minotor avant que le fichier lui-même puisse être typé. Aucune
  régression fonctionnelle tant qu'il reste en JS — `tsconfig.json` a
  `allowJs: true`.
