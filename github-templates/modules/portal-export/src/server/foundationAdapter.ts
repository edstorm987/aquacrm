// Foundation registration adapter — same pattern as forms +
// email-sender + client-CRM.

import type { AgencyId, PluginInstall } from "../lib/tenancy";
import type { PluginStorage } from "../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  FilesystemPort,
  PluginInstallStorePort,
  TenantPort,
  WebsiteEditorReaderPort,
} from "./ports";
import type { PortalExportContainer } from "./index";
import { buildPortalExportContainer } from "./index";

export interface PortalExportFoundation {
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  filesystem: FilesystemPort;
  // Optional cross-plugin port — website-editor's reader. Absent →
  // ExportService still produces a working app shell using preset
  // defaults only.
  websiteEditor?: WebsiteEditorReaderPort;
}

let registered: PortalExportFoundation | null = null;

export function registerPortalExportFoundation(deps: PortalExportFoundation): void {
  registered = deps;
}

export function clearPortalExportFoundation(): void {
  registered = null;
}

export function isFoundationRegistered(): boolean {
  return registered !== null;
}

export function requireFoundation(): PortalExportFoundation {
  if (!registered) {
    throw new Error(
      "@aqua/plugin-portal-export: foundation not registered. Call registerPortalExportFoundation({...}) at boot.",
    );
  }
  return registered;
}

export interface ContainerForArgs {
  agencyId: AgencyId;
  storage: PluginStorage;
  install?: PluginInstall;
}

export function containerFor(args: ContainerForArgs): PortalExportContainer {
  const f = requireFoundation();
  return buildPortalExportContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    tenant: f.tenant,
    activity: f.activity,
    events: f.events,
    pluginInstalls: f.pluginInstalls,
    filesystem: f.filesystem,
    websiteEditor: f.websiteEditor,
  });
}

export function containerWithDeps(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  filesystem: FilesystemPort;
  websiteEditor?: WebsiteEditorReaderPort;
}): PortalExportContainer {
  return buildPortalExportContainer(args);
}

export function _containerFromCtx(args: {
  agencyId: AgencyId;
  storage: PluginStorage;
}): PortalExportContainer | null {
  if (!registered) return null;
  return buildPortalExportContainer({
    agencyId: args.agencyId,
    storage: args.storage,
    tenant: registered.tenant,
    activity: registered.activity,
    events: registered.events,
    pluginInstalls: registered.pluginInstalls,
    filesystem: registered.filesystem,
    websiteEditor: registered.websiteEditor,
  });
}
