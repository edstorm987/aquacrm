// Manifest API routes — mounted at `/api/portal/kanban/...`.
// ~14 routes covering boards, columns, cards, templates.

import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  addColumnHandler,
  archiveBoardHandler,
  archiveCardHandler,
  createBoardHandler,
  createCardHandler,
  getBoardHandler,
  listBoardsHandler,
  listCardsHandler,
  listTemplatesHandler,
  moveCardHandler,
  moveColumnHandler,
  removeColumnHandler,
  restoreCardHandler,
  updateBoardHandler,
  updateCardHandler,
  updateColumnHandler,
} from "./handlers";

const AGENCY_ADMINS = ["agency-owner", "agency-manager"] as const;
const AGENCY_VIEWERS = ["agency-owner", "agency-manager", "agency-staff"] as const;
const CLIENT_ADMINS = ["client-owner", "client-staff"] as const;
const ADMIN_VIEWERS = [...AGENCY_VIEWERS, ...CLIENT_ADMINS] as const;
const ADMIN_ROLES = [...AGENCY_ADMINS, ...CLIENT_ADMINS] as const;

export const ROUTES: PluginApiRoute[] = [
  // Templates
  { path: "templates", methods: ["GET"], handler: listTemplatesHandler, visibleToRoles: [...ADMIN_VIEWERS] },

  // Boards
  { path: "boards", methods: ["GET"], handler: listBoardsHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "boards", methods: ["POST"], handler: createBoardHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards", methods: ["PATCH"], handler: updateBoardHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards", methods: ["DELETE"], handler: archiveBoardHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards/get", methods: ["GET"], handler: getBoardHandler, visibleToRoles: [...ADMIN_VIEWERS] },

  // Columns
  { path: "boards/columns", methods: ["POST"], handler: addColumnHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards/columns", methods: ["PATCH"], handler: updateColumnHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards/columns", methods: ["DELETE"], handler: removeColumnHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards/columns/move", methods: ["POST"], handler: moveColumnHandler, visibleToRoles: [...ADMIN_ROLES] },

  // Cards
  { path: "boards/cards", methods: ["GET"], handler: listCardsHandler, visibleToRoles: [...ADMIN_VIEWERS] },
  { path: "boards/cards", methods: ["POST"], handler: createCardHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards/cards", methods: ["PATCH"], handler: updateCardHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards/cards", methods: ["DELETE"], handler: archiveCardHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards/cards/move", methods: ["POST"], handler: moveCardHandler, visibleToRoles: [...ADMIN_ROLES] },
  { path: "boards/cards/restore", methods: ["POST"], handler: restoreCardHandler, visibleToRoles: [...ADMIN_ROLES] },
];
