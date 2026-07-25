import type { PluginApiRoute } from "../lib/aquaPluginTypes";
import {
  deleteFileHandler,
  getFileHandler,
  listFilesHandler,
  shareLinkHandler,
  uploadFileHandler,
} from "./handlers";

const ADMINS = ["agency-owner", "agency-manager", "client-owner"] as const;
const VIEWERS = ["agency-owner", "agency-manager", "agency-staff", "client-owner", "client-staff", "freelancer"] as const;

export const ROUTES: PluginApiRoute[] = [
  { path: "list",   methods: ["GET"],    handler: listFilesHandler,  visibleToRoles: [...VIEWERS] },
  { path: "get",    methods: ["GET"],    handler: getFileHandler,    visibleToRoles: [...VIEWERS] },
  { path: "upload", methods: ["POST"],   handler: uploadFileHandler, visibleToRoles: [...ADMINS] },
  { path: "delete", methods: ["DELETE"], handler: deleteFileHandler, visibleToRoles: [...ADMINS] },
  { path: "share-link", methods: ["POST"], handler: shareLinkHandler, visibleToRoles: [...ADMINS] },
];
