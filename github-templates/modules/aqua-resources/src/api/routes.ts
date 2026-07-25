import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  addItemHandler,
  createCollectionHandler,
  deleteCollectionHandler,
  listResourcesHandler,
  removeItemHandler,
  reorderItemsHandler,
  seedHandler,
  updateCollectionHandler,
  updateItemHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  // Read (T4 Incubator consumes this)
  { path: "resources", methods: ["GET"], handler: listResourcesHandler, visibleToRoles: [...VIEWERS] },

  // Collections
  { path: "collections/create", methods: ["POST"],   handler: createCollectionHandler, visibleToRoles: [...ADMINS] },
  { path: "collections/update", methods: ["PATCH"],  handler: updateCollectionHandler, visibleToRoles: [...ADMINS] },
  { path: "collections/delete", methods: ["DELETE"], handler: deleteCollectionHandler, visibleToRoles: [...ADMINS] },
  { path: "collections/seed",   methods: ["POST"],   handler: seedHandler,             visibleToRoles: [...ADMINS] },

  // Items
  { path: "items/add",     methods: ["POST"],   handler: addItemHandler,     visibleToRoles: [...ADMINS] },
  { path: "items/update",  methods: ["PATCH"],  handler: updateItemHandler,  visibleToRoles: [...ADMINS] },
  { path: "items/remove",  methods: ["DELETE"], handler: removeItemHandler,  visibleToRoles: [...ADMINS] },
  { path: "items/reorder", methods: ["POST"],   handler: reorderItemsHandler, visibleToRoles: [...ADMINS] },
];
