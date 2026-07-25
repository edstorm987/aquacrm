// Foundation port contracts for the portal-export plugin.
//
// Five standard ports + 2 OPTIONAL: WebsiteEditorReaderPort (cross-reads
// brand kit + active variants + custom content from the website-editor
// install when it exists for the same agency/client) and FilesystemPort
// (foundation gives a real fs/promises impl in dev; smoke injects a
// recording in-memory mock).

import type {
  ActivityCategory,
  ActivityEntry,
  AgencyId,
  Client,
  ClientId,
  PluginInstall,
  PluginInstallScope,
  UserId,
} from "../lib/tenancy";
import type { BlockTree, PortalRole } from "../lib/domain";

export interface StoragePort {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface TenantPort {
  getClient(id: ClientId): Promise<Client | null> | Client | null;
}

export interface LogActivityInput {
  agencyId: AgencyId;
  clientId?: ClientId;
  actorUserId?: UserId;
  actorEmail?: string;
  category: ActivityCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface ListActivityFilter {
  agencyId: AgencyId;
  clientId?: ClientId;
  limit?: number;
}

export interface ActivityLogPort {
  logActivity(input: LogActivityInput): Promise<ActivityEntry> | ActivityEntry;
  listActivity(filter: ListActivityFilter): Promise<ActivityEntry[]> | ActivityEntry[];
}

export type ExportEventName =
  | "export.started"
  | "export.completed"
  | "export.failed"
  | "export.preset.applied";

export interface EventBusPort {
  emit<T = unknown>(
    scope: { agencyId: AgencyId; clientId?: ClientId },
    name: ExportEventName | string,
    payload: T,
  ): void;
}

export interface PluginInstallStorePort {
  // Lists all installs for the scope so we know which plugin workspace
  // deps to write into the materialized package.json.
  listInstalls(scope: PluginInstallScope): Promise<PluginInstall[]> | PluginInstall[];
}

// ─── Optional cross-plugin port: website-editor's reader ─────────────────
//
// When the website-editor plugin is installed for the same agency/client,
// foundation supplies a port that reads the active portal variants +
// custom content. Absent → ExportService still produces a working
// app shell using preset defaults only.

export interface WebsiteEditorReaderPort {
  getActivePortalVariant(args: {
    agencyId: AgencyId;
    clientId: ClientId;
    role: PortalRole;
  }): Promise<{ variantId: string; tree: BlockTree } | null>;

  getCustomContent(args: {
    agencyId: AgencyId;
    clientId: ClientId;
  }): Promise<Record<string, string>>;

  getThemeTokens(args: {
    agencyId: AgencyId;
    clientId: ClientId;
  }): Promise<Record<string, string>>;
}

// ─── Filesystem port ─────────────────────────────────────────────────────
//
// Materialization writes directly to the repo at
// `04-the-final-portal/clients/<slug>/`. Foundation gives a real
// fs/promises impl in dev. Smoke tests inject an in-memory recorder
// keyed by absolute path.

export interface FilesystemPort {
  // Reads the file at `path` (utf-8). Returns undefined if not present.
  readFile(path: string): Promise<string | undefined>;

  // Writes `content` to `path` (utf-8). Creates parent dirs as needed.
  writeFile(path: string, content: string): Promise<void>;

  // Lists files recursively under `dir` (relative to the same root the
  // materializer writes to). Returns absolute paths. Used to detect
  // operator-added files that should be preserved.
  listFiles(dir: string): Promise<string[]>;

  // True if `path` exists.
  exists(path: string): Promise<boolean>;

  // Convert relative path → absolute under the configured root. Foundation
  // wires the root to the repo's `04-the-final-portal/clients/`. Smoke
  // wires it to a temp dir.
  resolveRoot(relativePath: string): string;
}
