# Vérifier votre ville

Deux vérifications, toutes deux moins coûteuses que de naviguer dans
l'interface, et toutes deux exercent les mêmes chemins de code que
l'application utilise réellement.

## Vérifier directement les données générées

Détecte les erreurs de configuration (un mauvais code `routeTypes`, une
faute de frappe dans une clé `agencyIds`) avant qu'elles n'atteignent
l'application :

```bash
python3 -c "
import json
from collections import Counter
data = json.load(open('data/cities/votre-ville/routes.json'))
print(Counter(r.get('mode', 'bus') for r in data))
"
# Counter({'bus': 186, 'tram': 21, 'ferry': 8, 'funicular': 3, 'rail': 3})
```

## Interroger directement l'API de routage

Démarrez le service de routage (ou utilisez
`docker compose restart routing-serve` s'il tourne déjà sur cette copie du
repo) et interrogez-le directement :

```bash
curl -s -X POST http://localhost:3011/routing/plan -H 'Content-Type: application/json' -d '{
  "citySlug":"votre-ville","fromLat":0.0,"fromLon":0.0,
  "toLat":0.0,"toLon":0.0,"time":"10:00:00","numItineraries":2
}' | python3 -m json.tool
```

Choisissez deux points qui forcent un mode précis que vous venez
d'ajouter — une origine et une destination proches d'arrêts de ce mode
uniquement, bien au-delà de la distance de marche, pour que l'itinéraire
ne puisse pas se replier sur un résultat tout-à-pied. Vérifiez que
`route.shortName` et `agency.gtfsId` dans la réponse correspondent au mode
et à l'agence attendus, et non `null` ou une ligne sans rapport.

Si vous avez ajouté un filtre `routeShortNames`/`stopsWithinBbox`,
confirmez aussi que le mode que vous vouliez exclure l'est réellement —
interrogez avec `"transportModes":["<mode>"]` dans le corps de la requête
et vérifiez que vous n'obtenez soit aucun itinéraire, soit des itinéraires
utilisant uniquement les routes que vous vouliez garder.
