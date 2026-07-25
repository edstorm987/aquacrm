// ExportService — the public entry point.
//
//   plan(clientId, options)   → ExportPlan (collected state + diff vs disk)
//   export(clientId, options) → ExportRecord (writes files via FilesystemPort)
//
// Idempotent: re-export with no operator edits is a no-op (every
// generator file unchanged → 0 writes). Re-export with an operator edit
// (file exists, fingerprint stored in portal-config doesn't match disk)
// preserves the operator's version + flags it.

import { fnv1a, makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, BrandKit, ClientId, PluginId, UserId } from "../lib/tenancy";
import type {
  CollectedClientState,
  ExportDiff,
  ExportOptions,
  ExportPlan,
  ExportRecord,
  GeneratedFingerprintMap,
  MaterializedFile,
  PortalRole,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  FilesystemPort,
  PluginInstallStorePort,
  StoragePort,
  TenantPort,
  WebsiteEditorReaderPort,
} from "./ports";
import type { PresetService } from "./presets";
import { materialize } from "./materializer";

export class ExportService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private tenant: TenantPort,
    private installs: PluginInstallStorePort,
    private filesystem: FilesystemPort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private presets: PresetService,
    private editor?: WebsiteEditorReaderPort,
  ) {}

  // ─── Collect ──────────────────────────────────────────────────────────

  async collect(clientId: ClientId): Promise<CollectedClientState | null> {
    const client = await Promise.resolve(this.tenant.getClient(clientId));
    if (!client || client.agencyId !== this.agencyId) return null;

    const installs = await Promise.resolve(
      this.installs.listInstalls({ agencyId: this.agencyId, clientId }),
    );
    const installedPlugins: PluginId[] = installs
      .filter(i => i.enabled)
      .map(i => i.pluginId);

    const portalVariants: Partial<Record<PortalRole, string>> = {};
    const blockTrees: CollectedClientState["blockTrees"] = [];
    if (this.editor) {
      const roles: PortalRole[] = ["login", "account", "orders", "affiliates"];
      for (const role of roles) {
        const variant = await this.editor.getActivePortalVariant({
          agencyId: this.agencyId, clientId, role,
        });
        if (variant) {
          portalVariants[role] = variant.variantId;
          blockTrees.push(variant.tree);
        }
      }
    }
    const customContent = this.editor
      ? await this.editor.getCustomContent({ agencyId: this.agencyId, clientId })
      : {};
    const themeTokens = this.editor
      ? await this.editor.getThemeTokens({ agencyId: this.agencyId, clientId })
      : {};

    return {
      client: {
        id: client.id,
        agencyId: client.agencyId,
        slug: client.slug,
        name: client.name,
        brand: client.brand,
        websiteUrl: client.websiteUrl,
        tagline: client.tagline,
        customDomain: client.customDomain,
      },
      installedPlugins,
      portalVariants,
      blockTrees,
      themeTokens,
      customContent,
    };
  }

  // ─── Plan ─────────────────────────────────────────────────────────────

  async plan(clientId: ClientId, options: ExportOptions = {}): Promise<ExportPlan | null> {
    const state = await this.collect(clientId);
    if (!state) return null;
    const preset = options.presetId ? this.presets.get(options.presetId) ?? undefined : undefined;
    if (options.brandOverride) {
      state.client.brand = mergeBrand(state.client.brand, options.brandOverride);
    }
    const files = materialize({ state, preset });
    const diff = await this.computeDiff(state.client.slug, files, options.destinationOverride);
    return {
      clientId,
      clientSlug: state.client.slug,
      presetId: options.presetId,
      installedPlugins: unique([
        ...state.installedPlugins,
        ...(preset?.installedPlugins ?? []),
      ]),
      portalVariants: { ...preset?.portalVariants, ...state.portalVariants },
      files,
      diff,
    };
  }

  // ─── Export ───────────────────────────────────────────────────────────

  async export(
    clientId: ClientId,
    options: ExportOptions = {},
    actor: UserId = "system",
  ): Promise<ExportRecord> {
    const startedAt = now();
    const plan = await this.plan(clientId, options);
    if (!plan) {
      const failed: ExportRecord = {
        id: makeId("exp"),
        agencyId: this.agencyId,
        clientId,
        clientSlug: clientId,
        presetId: options.presetId,
        status: "failed",
        filesWritten: 0,
        filesPreserved: 0,
        startedAt,
        completedAt: now(),
        actorUserId: actor,
        errorMessage: "Client not found in this agency.",
      };
      await this.recordHistory(failed);
      return failed;
    }

    this.events.emit({ agencyId: this.agencyId, clientId }, "export.started", {
      clientId, presetId: options.presetId,
    });

    let filesWritten = 0;
    if (!options.dryRun) {
      const destBase = options.destinationOverride ?? `clients/${plan.clientSlug}`;
      // Only write files that are in the changed/added sets — preserve
      // operator hand-edits (paths in `preserved`).
      const writeSet = new Set([...plan.diff.added, ...plan.diff.changed]);
      for (const file of plan.files) {
        if (!writeSet.has(file.path)) continue;
        const absPath = this.filesystem.resolveRoot(`${destBase}/${file.path}`);
        await this.filesystem.writeFile(absPath, file.content);
        filesWritten++;
      }
    }

    const record: ExportRecord = {
      id: makeId("exp"),
      agencyId: this.agencyId,
      clientId,
      clientSlug: plan.clientSlug,
      presetId: options.presetId,
      status: "ok",
      filesWritten,
      filesPreserved: plan.diff.preserved.length,
      startedAt,
      completedAt: now(),
      actorUserId: actor,
    };
    await this.recordHistory(record);
    if (options.presetId) {
      this.events.emit({ agencyId: this.agencyId, clientId }, "export.preset.applied", {
        presetId: options.presetId,
      });
    }
    this.events.emit({ agencyId: this.agencyId, clientId }, "export.completed", {
      clientId, filesWritten, filesPreserved: record.filesPreserved,
    });
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId,
      actorUserId: actor,
      category: "export",
      action: "export.completed",
      message: options.dryRun
        ? `Dry-run export for ${plan.clientSlug}: ${plan.files.length} files planned (${plan.diff.added.length} new, ${plan.diff.changed.length} changed, ${plan.diff.preserved.length} preserved).`
        : `Exported ${plan.clientSlug}: ${filesWritten} files written, ${record.filesPreserved} preserved.`,
      metadata: {
        clientSlug: plan.clientSlug,
        presetId: options.presetId,
        dryRun: options.dryRun,
        added: plan.diff.added.length,
        changed: plan.diff.changed.length,
        preserved: plan.diff.preserved.length,
      },
    });
    return record;
  }

  // ─── Diff ─────────────────────────────────────────────────────────────
  //
  // Compare the materialized file set against what's currently on disk.
  // Three categories:
  //
  //   added     — file doesn't exist on disk (we'll write it).
  //   changed   — file exists, fingerprint matches our prior generation
  //               (recorded in portal-config._generatedFingerprints), but
  //               our new content differs → safe to overwrite.
  //   preserved — file exists but disk content's fingerprint doesn't
  //               match what we last generated → operator hand-edited
  //               it → DO NOT overwrite.
  //
  // First-time export: no portal-config exists → every existing file is
  // treated as preserved.

  private async computeDiff(
    slug: string,
    files: MaterializedFile[],
    destOverride?: string,
  ): Promise<ExportDiff> {
    const destBase = destOverride ?? `clients/${slug}`;
    const priorLedger = await this.readPriorLedger(destBase);

    const added: string[] = [];
    const changed: string[] = [];
    const preserved: string[] = [];
    const unchanged: string[] = [];

    for (const file of files) {
      const absPath = this.filesystem.resolveRoot(`${destBase}/${file.path}`);
      const exists = await this.filesystem.exists(absPath);
      if (!exists) {
        added.push(file.path);
        continue;
      }
      const onDisk = await this.filesystem.readFile(absPath);
      const onDiskFp = onDisk !== undefined ? fnv1a(onDisk) : undefined;
      if (onDiskFp === file.fingerprint) {
        unchanged.push(file.path);
        continue;
      }
      // Existing file differs from our planned output. Was it ours
      // (matches prior ledger) or did the operator edit it?
      const priorFp = priorLedger?.[file.path];
      if (priorFp && priorFp === onDiskFp) {
        // We owned it; operator hasn't touched. Safe to overwrite.
        changed.push(file.path);
      } else {
        // Either no prior ledger entry (first-time export) or operator
        // edited the file we previously wrote. Preserve.
        preserved.push(file.path);
      }
    }

    return { added, changed, preserved, unchanged };
  }

  private async readPriorLedger(destBase: string): Promise<GeneratedFingerprintMap | null> {
    const absConfigPath = this.filesystem.resolveRoot(`${destBase}/portal-config.json`);
    if (!await this.filesystem.exists(absConfigPath)) return null;
    const raw = await this.filesystem.readFile(absConfigPath);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { _generatedFingerprints?: GeneratedFingerprintMap };
      return parsed._generatedFingerprints ?? null;
    } catch { return null; }
  }

  // ─── History ──────────────────────────────────────────────────────────

  private async recordHistory(record: ExportRecord): Promise<void> {
    await this.storage.set(`export/by-id/${record.id}`, record);
    const indexKey = `export/by-client/${record.clientId}`;
    const prior = (await this.storage.get<string[]>(indexKey)) ?? [];
    if (!prior.includes(record.id)) {
      await this.storage.set(indexKey, [...prior, record.id]);
    }
    const allKey = "export/index";
    const all = (await this.storage.get<string[]>(allKey)) ?? [];
    if (!all.includes(record.id)) {
      await this.storage.set(allKey, [...all, record.id]);
    }
  }

  async listHistory(filter?: { clientId?: ClientId }): Promise<ExportRecord[]> {
    const ids = filter?.clientId
      ? ((await this.storage.get<string[]>(`export/by-client/${filter.clientId}`)) ?? [])
      : ((await this.storage.get<string[]>("export/index")) ?? []);
    const out: ExportRecord[] = [];
    for (const id of ids) {
      const row = await this.storage.get<ExportRecord>(`export/by-id/${id}`);
      if (row) out.push(row);
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  async getHistory(id: string): Promise<ExportRecord | null> {
    const row = await this.storage.get<ExportRecord>(`export/by-id/${id}`);
    return row && row.agencyId === this.agencyId ? row : null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function mergeBrand(client: BrandKit, override: Partial<BrandKit>): BrandKit {
  return {
    ...client,
    ...override,
    primaryColor: override.primaryColor ?? client.primaryColor,
  };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
