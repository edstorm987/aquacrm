import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  bulkTickHandler,
  createItemHandler,
  deleteItemHandler,
  listItemsHandler,
  reorderHandler,
  tickItemHandler,
  updateItemHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager", "agency-staff"] as const;
// Customers (end-customers / client-staff) can tick THEIR items via
// the standard tick route — visibility is enforced at UI level too.
const VIEWERS = [
  "agency-owner", "agency-manager", "agency-staff",
  "client-owner", "client-staff", "freelancer", "end-customer",
] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "items",         methods: ["GET"],    handler: listItemsHandler,   visibleToRoles: [...VIEWERS] },
  { path: "items/create",  methods: ["POST"],   handler: createItemHandler,  visibleToRoles: [...ADMINS]  },
  { path: "items/update",  methods: ["PATCH"],  handler: updateItemHandler,  visibleToRoles: [...ADMINS]  },
  { path: "items/tick",    methods: ["POST"],   handler: tickItemHandler,    visibleToRoles: [...VIEWERS] },
  { path: "items/bulk",    methods: ["POST"],   handler: bulkTickHandler,    visibleToRoles: [...ADMINS]  },
  { path: "items/reorder", methods: ["POST"],   handler: reorderHandler,     visibleToRoles: [...ADMINS]  },
  { path: "items/delete",  methods: ["DELETE"], handler: deleteItemHandler,  visibleToRoles: [...ADMINS]  },
];
