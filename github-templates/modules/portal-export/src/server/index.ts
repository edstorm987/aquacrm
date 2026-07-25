// Server-side barrel — services + container builder + foundation adapter.

export { ExportService } from "./exports";
export { PresetService } from "./presets";
export { materialize } from "./materializer";
export type { MaterializeArgs } from "./materializer";

export type {
  ActivityLogPort,
  EventBusPort,
  ExportEventName,
  FilesystemPort,
  ListActivityFilter,
  LogActivityInput,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  WebsiteEditorReaderPort,
} from "./ports";

export {
  registerPortalExportFoundation,
  clearPortalExportFoundation,
  isFoundationRegistered,
  requireFoundation,
  containerFor,
  containerWithDeps,
  _containerFromCtx,
} from "./foundationAdapter";
export type {
  PortalExportFoundation,
  ContainerForArgs,
} from "./foundationAdapter";

import type { AgencyId } from "./../lib/tenancy";
import type { PluginStorage } from "./../lib/aquaPluginTypes";
import type {
  ActivityLogPort,
  EventBusPort,
  FilesystemPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  WebsiteEditorReaderPort,
} from "./ports";
import { ExportService } from "./exports";
import { PresetService } from "./presets";

// ─── Container ────────────────────────────────────────────────────────────

export interface PortalExportDeps {
  agencyId: AgencyId;
  storage: PluginStorage | StoragePort;
  tenant: TenantPort;
  activity: ActivityLogPort;
  events: EventBusPort;
  pluginInstalls: PluginInstallStorePort;
  filesystem: FilesystemPort;
  websiteEditor?: WebsiteEditorReaderPort;
}

export interface PortalExportContainer {
  exports: ExportService;
  presets: PresetService;
}

export function buildPortalExportContainer(deps: PortalExportDeps): PortalExportContainer {
  const storage = deps.storage as StoragePort;
  const presets = new PresetService();
  const exportsService = new ExportService(
    deps.agencyId,
    storage,
    deps.tenant,
    deps.pluginInstalls,
    deps.filesystem,
    deps.activity,
    deps.events,
    presets,
    deps.websiteEditor,
  );
  return { exports: exportsService, presets };
}
