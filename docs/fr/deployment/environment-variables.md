# Variables d'environnement

`config/.env` (à copier depuis `config/.env.example`) est le point
d'entrée unique de configuration du déploiement. Les variables `VITE_*`
sont injectées au moment du build et visibles dans le bundle du
navigateur — n'y mettez jamais de secrets.

`config/.env.example` est entièrement commenté et constitue la référence
faisant autorité pour chaque variable — copiez-le, ne le dupliquez pas
ici.
