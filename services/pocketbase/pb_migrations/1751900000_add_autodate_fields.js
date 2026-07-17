migrate((app) => {
  // Recreate the collection with proper autodate fields (created/updated were missing)
  // The single existing test report is acceptable to lose.
  try { app.delete(app.findCollectionByNameOrId("reports")) } catch (_) {}

  const collection = new Collection({
    name: "reports",
    type: "base",
    createRule: "",
    listRule:   "",
    viewRule:   "",
    updateRule: "",
    deleteRule: "",
    fields: [
      { type: "autodate", name: "created", system: true, onCreate: true,  onUpdate: false },
      { type: "autodate", name: "updated", system: true, onCreate: true,  onUpdate: true  },
      { type: "text",     name: "city",          required: true },
      { type: "select",   name: "entity_type",   required: true, values: ["stop","line","route","general"],                      maxSelect: 1 },
      { type: "text",     name: "entity_id" },
      { type: "text",     name: "entity_name" },
      { type: "select",   name: "category",      required: true, values: ["wrong_stop","route_changed","wrong_schedule","other"], maxSelect: 1 },
      { type: "text",     name: "description",   max: 1000 },
      { type: "email",    name: "contact_email" },
      { type: "select",   name: "status",        required: true, values: ["new","reviewed","resolved","wontfix"],                maxSelect: 1 },
    ],
  })
  return app.save(collection)
}, (app) => {
  try { app.delete(app.findCollectionByNameOrId("reports")) } catch (_) {}
})
