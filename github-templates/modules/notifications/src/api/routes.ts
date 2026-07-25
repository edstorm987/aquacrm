import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  archiveRuleHandler,
  createRuleHandler,
  getConfigHandler,
  getRuleHandler,
  listRulesHandler,
  setConfigHandler,
  updateRuleHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "rules",        methods: ["GET"],    handler: listRulesHandler,   visibleToRoles: [...VIEWERS] },
  { path: "rules/get",    methods: ["GET"],    handler: getRuleHandler,     visibleToRoles: [...VIEWERS] },
  { path: "rules/create", methods: ["POST"],   handler: createRuleHandler,  visibleToRoles: [...VIEWERS] },
  { path: "rules/update", methods: ["PATCH"],  handler: updateRuleHandler,  visibleToRoles: [...VIEWERS] },
  { path: "rules/archive", methods: ["DELETE"], handler: archiveRuleHandler, visibleToRoles: [...VIEWERS] },
  { path: "config",       methods: ["GET"],    handler: getConfigHandler,   visibleToRoles: [...VIEWERS] },
  { path: "config/save",  methods: ["PATCH"],  handler: setConfigHandler,   visibleToRoles: [...ADMINS] },
];
