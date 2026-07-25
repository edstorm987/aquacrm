// Portal-export domain. Per-install plugin storage. `scopePolicy: "either"` —
// usable at agency or client scope. Materializes a Live client's content into
// `04-the-final-portal/clients/<slug>/` as a self-contained Next.js app.

import type { AgencyId, BrandKit, ClientId, ClientStage, PluginId, UserId } from "./tenancy";

// ─── Portal-role keying ──────────────────────────────────────────────────
//
// Mirrors website-editor's PortalRole — which surface a starter variant
// renders, NOT which user role sees it.

export type PortalRole = "login" | "account" | "orders" | "affiliates";

// ─── Block tree (opaque to portal-export) ────────────────────────────────
//
// website-editor owns the canonical BlockTree shape. We carry it as
// opaque JSON so the export package stays decoupled — the materializer
// emits the JSON literal into the generated app and trusts the
// per-client portal's renderer to consume it.

export interface BlockNode {
  id: string;
  type: string;
  props?: Record<string, unknown>;
  children?: BlockNode[];
}

export interface BlockTree {
  pageId: string;
  title?: string;
  rootBlocks: BlockNode[];
}

// ─── Preset portal library ───────────────────────────────────────────────

export interface PortalPreset {
  id: string;
  label: string;
  description: string;
  icon?: string;                                  // hex color or emoji
  installedPlugins: PluginId[];                   // plugin ids to seed in materialized app
  portalVariants: Partial<Record<PortalRole, string>>; // which variant per role
  starterContent: { pages: BlockTree[] };
  defaultBrand: BrandKit;
  recommendedPhase: ClientStage;
}

// ─── Export plan + result ────────────────────────────────────────────────
//
// ExportPlan is what the operator sees in the diff preview. ExportResult
// is the post-materialize record we persist to history.

export interface MaterializedFile {
  path: string;                                   // relative to clients/<slug>/
  content: string;                                // utf-8 file body
  fingerprint: string;                            // fnv1a(content) — for diff
  generated: boolean;                             // true = produced by export, false = preserved operator file
}

export interface ExportPlan {
  clientId: ClientId;
  clientSlug: string;
  presetId?: string;
  installedPlugins: PluginId[];
  portalVariants: Partial<Record<PortalRole, string>>;
  files: MaterializedFile[];                      // intended file set
  diff: ExportDiff;                               // vs current on-disk state
}

export interface ExportDiff {
  added: string[];                                // paths that don't exist on disk
  changed: string[];                              // paths whose content differs from generator output
  preserved: string[];                            // paths kept verbatim (operator hand-edits or files we don't touch)
  unchanged: string[];                            // paths whose content already matches generator output
}

export interface ExportRecord {
  id: string;
  agencyId: AgencyId;
  clientId: ClientId;
  clientSlug: string;
  presetId?: string;
  status: "ok" | "failed";
  filesWritten: number;
  filesPreserved: number;
  prUrl?: string;
  commitHash?: string;
  startedAt: number;
  completedAt: number;
  actorUserId?: UserId;
  errorMessage?: string;
}

// ─── Inputs ──────────────────────────────────────────────────────────────

export interface ExportOptions {
  presetId?: string;                              // omit → blank export from collected state
  brandOverride?: Partial<BrandKit>;              // operator can adjust before commit
  destinationOverride?: string;                   // default: "clients/<slug>/"
  dryRun?: boolean;                               // true → produce plan but don't write
  prTitle?: string;                               // when foundation surfaces a PR-open hook
}

// ─── Foundation read shape ───────────────────────────────────────────────
//
// What the WebsiteEditorReaderPort returns when present. Optional —
// when absent, we still materialize a working app shell minus dynamic
// pages.

export interface CollectedClientState {
  client: {
    id: ClientId;
    agencyId: AgencyId;
    slug: string;
    name: string;
    brand: BrandKit;
    websiteUrl?: string;
    tagline?: string;
    customDomain?: string;
  };
  installedPlugins: PluginId[];
  portalVariants: Partial<Record<PortalRole, string>>;
  blockTrees: BlockTree[];                        // active variants' rendered trees
  themeTokens: Record<string, string>;            // flat key→value
  customContent: Record<string, string>;          // flat key→value (site.name, hero.headline1, …)
}

// ─── Foundation portal-config schema ────────────────────────────────────
//
// What we serialize as `portal-config.json` in the materialized folder.
// Mirrors T5's luv-and-ker shape exactly so future re-exports can
// round-trip without re-reading foundation state.

export interface PortalConfigDoc {
  $schema: string;
  client: {
    id: string;
    slug: string;
    name: string;
    tagline?: string;
    agencyId: string;
    websiteUrl?: string;
  };
  brand: BrandKit;
  auth: {
    origin: string;
    embedLoginPath: string;
    loginPath: string;
    cookieName: string;
  };
  installedPlugins: { id: string; version: string }[];
  portalVariants: Partial<Record<PortalRole, string>>;
  content: Record<string, string>;
}

// ─── Idempotency mark ────────────────────────────────────────────────────
//
// Fingerprint of every file we generated, persisted alongside the
// portal-config so the next re-export knows which files we authored
// (changed → re-generate) vs which are operator hand-edits (preserve).
// Stored in the portal-config under `_generatedFingerprints`.

export interface GeneratedFingerprintMap {
  [path: string]: string;                          // relative path → fnv1a fingerprint
}
