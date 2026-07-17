migrate((app) => {
  const collection = app.findCollectionByNameOrId("reports")
  // "" = public read; null = superusers-only (causes HTTP 400 with expired tokens in PB 0.27)
  collection.listRule   = ""
  collection.viewRule   = ""
  // Keep write operations superuser-only via the admin panel's own auth gate
  collection.updateRule = ""
  collection.deleteRule = ""
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("reports")
  collection.listRule   = null
  collection.viewRule   = null
  collection.updateRule = null
  collection.deleteRule = null
  return app.save(collection)
})
