// API route manifest. Mounted by the foundation under
// `/api/portal/fulfillment/<path>`.
//
// Routes are kept short + verb-oriented so URL alone tells you what
// they do. Path conventions:
//
//   GET  /clients                     list clients for the agency
//   POST /clients                     create a client (with phase preset)
//   POST /phase/advance               advance a client to next phase
//   GET  /checklist                   ?clientId=&phaseId= → view
//   POST /checklist/tick              tick / untick a checklist item
//   GET  /phases                      list phase definitions for the agency
//   POST /phases                      upsert a phase definition
//   DELETE /phases                    ?id= delete a phase
//   GET  /presets                     list seeded phase presets (wizard tooltip)
//   GET  /marketplace                 ?clientId= → cards
//   POST /marketplace/install         install a plugin for a client
//   POST /marketplace/enable          enable / disable an install
//   POST /marketplace/uninstall       uninstall a plugin for a client
//   GET  /activity                    ?clientId= optional, recent entries

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  advancePhaseHandler,
  createClientHandler,
  deletePhaseHandler,
  getChecklistHandler,
  listActivityHandler,
  listClientsHandler,
  listPhasePresetsHandler,
  listPhasesHandler,
  marketplaceInstallHandler,
  marketplaceListHandler,
  marketplaceSetEnabledHandler,
  marketplaceUninstallHandler,
  tickItemHandler,
  upsertPhaseHandler,
} from "./handlers";

export const apiRoutes: readonly PluginApiRoute[] = [
  { path: "clients", methods: ["GET"], handler: listClientsHandler },
  { path: "clients", methods: ["POST"], handler: createClientHandler },
  { path: "phase/advance", methods: ["POST"], handler: advancePhaseHandler },
  { path: "checklist", methods: ["GET"], handler: getChecklistHandler },
  { path: "checklist/tick", methods: ["POST"], handler: tickItemHandler },
  { path: "phases", methods: ["GET"], handler: listPhasesHandler },
  { path: "phases", methods: ["POST"], handler: upsertPhaseHandler },
  { path: "phases", methods: ["DELETE"], handler: deletePhaseHandler },
  { path: "presets", methods: ["GET"], handler: listPhasePresetsHandler },
  { path: "marketplace", methods: ["GET"], handler: marketplaceListHandler },
  { path: "marketplace/install", methods: ["POST"], handler: marketplaceInstallHandler },
  { path: "marketplace/enable", methods: ["POST"], handler: marketplaceSetEnabledHandler },
  { path: "marketplace/uninstall", methods: ["POST"], handler: marketplaceUninstallHandler },
  { path: "activity", methods: ["GET"], handler: listActivityHandler },
] as const;
