import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  createReportHandler,
  deleteReportHandler,
  getReportHandler,
  listReportsHandler,
  markSentHandler,
  patchReportHandler,
  publishReportHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const VIEWERS = [
  "agency-owner", "agency-manager", "agency-staff",
  "client-owner", "client-staff", "freelancer", "end-customer",
] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "list",      methods: ["GET"],    handler: listReportsHandler,   visibleToRoles: [...VIEWERS] },
  { path: "get",       methods: ["GET"],    handler: getReportHandler,     visibleToRoles: [...VIEWERS] },
  { path: "create",    methods: ["POST"],   handler: createReportHandler,  visibleToRoles: [...ADMINS]  },
  { path: "patch",     methods: ["PATCH"],  handler: patchReportHandler,   visibleToRoles: [...ADMINS]  },
  { path: "publish",   methods: ["POST"],   handler: publishReportHandler, visibleToRoles: [...ADMINS]  },
  { path: "mark-sent", methods: ["POST"],   handler: markSentHandler,      visibleToRoles: [...ADMINS]  },
  { path: "delete",    methods: ["DELETE"], handler: deleteReportHandler,  visibleToRoles: [...ADMINS]  },
];
