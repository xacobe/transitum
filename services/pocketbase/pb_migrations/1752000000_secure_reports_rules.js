migrate((app) => {
  // The previous migration (1751800000) set these to "" (public) to work
  // around PocketBase 0.27 returning 400 instead of 401 for an expired
  // superuser token - but "" means genuinely public, not "authenticated
  // users only": anyone could list/view every report (including
  // contact_email, PII) and update/delete any of them, unauthenticated,
  // through the public /pb/api/ proxy. frontend/src/services/
  // pocketbaseClient.ts's pbFetch already treated a 400 as an expired
  // token (clears it and forces re-login) for other requests; pbVerifyAuth
  // now does too, so the 0.27 workaround is no longer needed to keep the
  // admin panel usable. createRule stays "" - anonymous users must still be
  // able to submit a report.
  const collection = app.findCollectionByNameOrId("reports")
  collection.listRule   = null
  collection.viewRule   = null
  collection.updateRule = null
  collection.deleteRule = null
  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("reports")
  collection.listRule   = ""
  collection.viewRule   = ""
  collection.updateRule = ""
  collection.deleteRule = ""
  return app.save(collection)
})
