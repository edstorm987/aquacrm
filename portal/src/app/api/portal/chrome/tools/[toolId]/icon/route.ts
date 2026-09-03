import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import {
  beginStagedPrivateUpload,
  claimStagedPrivateUploadsForOwnership,
  commitStagedPrivateUploadOwnership,
  confirmStagedPrivateUpload,
  deletePrivateObjectWithRecovery,
  pendingPrivateObjectDeletionSnapshots,
  privateObjectRequestHash,
  PrivateObjectLifecycleClaimError,
  releaseStagedPrivateUploadOwnershipClaim,
  type StagedPrivateUploadBinding,
} from "@/lib/server/privateObjectLifecycle";
import {
  compensatePrivateUpload,
  planPrivateUpload,
  PrivateUploadStorageError,
  readSupabasePrivateUpload,
  storePrivateUpload,
} from "@/lib/server/privateUploadStorage";
import {
  chromeLayoutKey,
  getUserChromeLayout,
  normaliseLayout,
  SAVED_TOOL_ICON_DELETE_PURPOSE,
  SAVED_TOOL_ICON_STAGE_PURPOSE,
  sameSavedToolIconAsset,
  setSavedToolIconAsset,
  userChromeLayoutLockKey,
} from "@/lib/server/chrome/userChromeLayout";
import {
  ProductWorkspaceBusyError,
  withPortalProviderLease,
  withPortalStateTransaction,
} from "@/server/productWorkspaceCoordinator";
import { ensureHydrated } from "@/server/storage";
import type { PortalState, SavedToolIconAsset, UserChromeLayout } from "@/server/types";

export const runtime = "nodejs";

const LOCAL_DIRECTORY = "saved-tool-icons";
const STAGE_PURPOSE = SAVED_TOOL_ICON_STAGE_PURPOSE;
const DELETE_PURPOSE = SAVED_TOOL_ICON_DELETE_PURPOSE;
const MAX_ICON_BYTES = 512 * 1024;
const ICON_DELETE_RETRY_MS = 24 * 60 * 60_000;
const ALLOWED_TYPES = new Set<SavedToolIconAsset["contentType"]>(["image/png", "image/jpeg", "image/webp"]);

type Context = { params: Promise<{ toolId: string }> };
type SelfScope = { agencyId: string; userId: string };

class SavedToolIconConflictError extends Error {
  constructor() {
    super("This tool changed in another tab. The latest version has been loaded; try again.");
    this.name = "SavedToolIconConflictError";
  }
}

function scopeSegment(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function safeName(value: string): string {
  return value.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 120) || "tool-icon";
}

function responseHeaders(asset: SavedToolIconAsset): Headers {
  const headers = new Headers();
  headers.set("content-type", asset.contentType);
  headers.set("content-length", String(asset.size));
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.fileName)}`);
  // The URL is same-origin and authenticated. Never let a later account in a
  // shared browser inherit private bytes from the previous account's cache.
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("x-content-type-options", "nosniff");
  return headers;
}

async function self(request: NextRequest): Promise<SelfScope | null> {
  const session = await getSessionFromRequest(request);
  return session ? { agencyId: session.agencyId, userId: session.userId } : null;
}

function notFound() {
  return NextResponse.json(
    { ok: false, error: "Tool icon not found." },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

function iconConflict(layout?: UserChromeLayout) {
  return NextResponse.json({
    ok: false,
    error: "This tool changed in another tab. The latest version has been loaded; try again.",
    code: "saved_tool_icon_conflict",
    ...(layout ? { layout } : {}),
  }, { status: 409, headers: { "cache-control": "no-store" } });
}

function providerLane(who: SelfScope, toolId: string): string {
  return `saved-tool-icon:${who.agencyId}:${who.userId}:${toolId}`;
}

function deletionObjectId(who: SelfScope, toolId: string, asset: SavedToolIconAsset): string {
  return createHash("sha256")
    .update([who.agencyId, who.userId, toolId, asset.storageProvider, asset.storageKey].join("\u0000"))
    .digest("hex");
}

/** Retry retained provider refusals for this exact user's exact tool. */
async function retryPendingIconCleanup(who: SelfScope, toolId: string): Promise<boolean> {
  return withPortalStateTransaction(userChromeLayoutLockKey(who.agencyId, who.userId), async () => {
    const pending = pendingPrivateObjectDeletionSnapshots<SavedToolIconAsset>(who.agencyId, DELETE_PURPOSE)
      .filter(({ record }) => record.metadata?.userId === who.userId && record.metadata?.toolId === toolId);
    let allClean = true;
    for (const { record } of pending) {
      const replay = await deletePrivateObjectWithRecovery<SavedToolIconAsset>({
        agencyId: who.agencyId,
        purpose: DELETE_PURPOSE,
        objectId: record.objectId,
        requestHash: record.requestHash,
        localDirectory: LOCAL_DIRECTORY,
        retryAfterMs: ICON_DELETE_RETRY_MS,
        prepare: () => { throw new Error("saved_tool_icon_replay_checkpoint_missing"); },
      });
      if (!replay.ok) allClean = false;
    }
    return allClean;
  });
}

/**
 * Durably record an asset that is no longer referenced before provider I/O.
 * A refusal keeps the exact provider/key in the lifecycle ledger for retry.
 */
async function cleanupDetachedIcon(
  who: SelfScope,
  toolId: string,
  detached: SavedToolIconAsset,
  expectedCurrent: SavedToolIconAsset | undefined,
): Promise<boolean> {
  const objectId = deletionObjectId(who, toolId, detached);
  const requestHash = privateObjectRequestHash([
    DELETE_PURPOSE,
    who.agencyId,
    who.userId,
    toolId,
    detached.storageProvider,
    detached.storageKey,
  ]);
  const result = await withPortalStateTransaction(userChromeLayoutLockKey(who.agencyId, who.userId), () =>
    deletePrivateObjectWithRecovery<SavedToolIconAsset>({
      agencyId: who.agencyId,
      purpose: DELETE_PURPOSE,
      objectId,
      requestHash,
      localDirectory: LOCAL_DIRECTORY,
      retryAfterMs: ICON_DELETE_RETRY_MS,
      prepare: () => {
        const latest = getUserChromeLayout(who.agencyId, who.userId);
        const tool = latest.savedTools.find(candidate => candidate.id === toolId);
        if (!tool || !sameSavedToolIconAsset(tool.iconAsset, expectedCurrent)) {
          throw new SavedToolIconConflictError();
        }
        return {
          snapshot: detached,
          storageProvider: detached.storageProvider,
          storageKey: detached.storageKey,
          metadata: { userId: who.userId, toolId },
        };
      },
    }));
  return result.ok;
}

export async function GET(request: NextRequest, context: Context) {
  try {
    await ensureHydrated();
    const who = await self(request);
    if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const { toolId } = await context.params;
    const tool = getUserChromeLayout(who.agencyId, who.userId).savedTools.find(candidate => candidate.id === toolId);
    const asset = tool?.iconAsset;
    if (!asset) return notFound();
    const headers = responseHeaders(asset);

    if (asset.storageProvider === "supabase") {
      const stored = await readSupabasePrivateUpload(asset.storageKey);
      return stored ? new Response(stored, { status: 200, headers }) : notFound();
    }
    if (asset.storageProvider === "vercel-blob") {
      const stored = await get(asset.storageKey, { access: "private", useCache: false });
      return stored?.statusCode === 200 && stored.stream
        ? new Response(stored.stream, { status: 200, headers })
        : notFound();
    }

    const root = resolve(process.cwd(), ".data", LOCAL_DIRECTORY);
    const target = resolve(root, asset.storageKey);
    if (!target.startsWith(`${root}${sep}`)) return notFound();
    const bytes = await readFile(target).catch(() => null);
    return bytes ? new Response(bytes, { status: 200, headers }) : notFound();
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    await ensureHydrated();
    const who = await self(request);
    if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const { toolId } = await context.params;

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose an icon image." }, { status: 400 });
    }
    if (!file.size || file.size > MAX_ICON_BYTES) {
      return NextResponse.json({ ok: false, error: "Tool icons must be smaller than 512 KB." }, { status: 413 });
    }
    if (!ALLOWED_TYPES.has(file.type as SavedToolIconAsset["contentType"])) {
      return NextResponse.json({ ok: false, error: "Upload a PNG, JPEG, or WebP image." }, { status: 415 });
    }

    return await withPortalProviderLease(providerLane(who, toolId), async () => {
      const priorCleanupComplete = await retryPendingIconCleanup(who, toolId);
      const before = await withPortalStateTransaction(
        userChromeLayoutLockKey(who.agencyId, who.userId),
        () => getUserChromeLayout(who.agencyId, who.userId),
      );
      const existing = before.savedTools.find(tool => tool.id === toolId);
      if (!existing) return notFound();
      const previous = existing.iconAsset;

      const assetId = `toolicon_${randomBytes(8).toString("hex")}`;
      const claimId = `saved-tool-icon-owner:${assetId}`;
      const fileName = safeName(file.name);
      const agencyScope = scopeSegment(who.agencyId);
      const userScope = scopeSegment(who.userId);
      const toolScope = scopeSegment(toolId);
      const pathname = `saved-tool-icons/${agencyScope}/${userScope}/${toolScope}/${assetId}-${fileName}`;
      const localKey = join(agencyScope, userScope, toolScope, `${assetId}-${fileName}`);
      const requestHash = privateObjectRequestHash([
        STAGE_PURPOSE,
        who.agencyId,
        who.userId,
        toolId,
        assetId,
        file.name,
        file.size,
        file.type,
        pathname,
      ]);
      const planned = planPrivateUpload({ pathname, localKey });
      await beginStagedPrivateUpload({
        agencyId: who.agencyId,
        purpose: STAGE_PURPOSE,
        objectId: assetId,
        requestHash,
        planned,
        localDirectory: LOCAL_DIRECTORY,
        metadata: { userId: who.userId, toolId },
      });
      const stored = await storePrivateUpload({
        pathname,
        file,
        contentType: file.type,
        localDirectory: LOCAL_DIRECTORY,
        localKey,
      });
      await confirmStagedPrivateUpload({
        agencyId: who.agencyId,
        purpose: STAGE_PURPOSE,
        objectId: assetId,
        requestHash,
        stored,
      });
      const binding: StagedPrivateUploadBinding = {
        objectId: assetId,
        storageProvider: stored.storageProvider,
        storageKey: stored.storageKey,
      };
      await claimStagedPrivateUploadsForOwnership({
        agencyId: who.agencyId,
        purpose: STAGE_PURPOSE,
        objectIds: [assetId],
        expectedBindings: [binding],
        claimId,
      });

      const iconAsset: SavedToolIconAsset = {
        fileName: file.name.trim().slice(0, 160) || "tool-icon",
        contentType: file.type as SavedToolIconAsset["contentType"],
        size: file.size,
        storageProvider: stored.storageProvider,
        storageKey: stored.storageKey,
        uploadedAt: Date.now(),
      };
      let definiteOwnerRefusal = false;
      let layout: UserChromeLayout;
      try {
        layout = await withPortalStateTransaction(userChromeLayoutLockKey(who.agencyId, who.userId), () =>
          commitStagedPrivateUploadOwnership({
            agencyId: who.agencyId,
            purpose: STAGE_PURPOSE,
            objectIds: [assetId],
            expectedBindings: [binding],
            claimId,
            commit: async () => {
              const attached = setSavedToolIconAsset(
                who.agencyId,
                who.userId,
                toolId,
                iconAsset,
                Date.now(),
                { expectedCurrent: previous ?? null },
              );
              if (!attached) {
                definiteOwnerRefusal = true;
                throw new SavedToolIconConflictError();
              }
              return { ownerId: `${who.userId}:${toolId}`, value: attached };
            },
          }));
      } catch (error) {
        if (!definiteOwnerRefusal && !(error instanceof SavedToolIconConflictError)) throw error;
        // A compare refusal happened before any owner mutation. Release that
        // exact claim, then compensate the newly stored object. Unknown commit
        // outcomes deliberately retain their claim and never enter this path.
        await releaseStagedPrivateUploadOwnershipClaim({
          agencyId: who.agencyId,
          purpose: STAGE_PURPOSE,
          objectIds: [assetId],
          expectedBindings: [binding],
          claimId,
        });
        const compensation = await compensatePrivateUpload(stored, LOCAL_DIRECTORY);
        if (!compensation.ok) {
          return NextResponse.json({
            ok: false,
            error: "The tool changed elsewhere and the unused uploaded copy is queued for cleanup. Try again once the latest card appears.",
            code: "saved_tool_icon_cleanup_pending",
          }, { status: 503 });
        }
        return iconConflict(getUserChromeLayout(who.agencyId, who.userId));
      }

      let cleanupPending = !priorCleanupComplete;
      if (previous) {
        cleanupPending = !(await cleanupDetachedIcon(who, toolId, previous, iconAsset)) || cleanupPending;
      }
      return NextResponse.json({
        ok: true,
        layout,
        cleanupPending,
        ...(cleanupPending ? { warning: "The new icon is saved. An older private copy is retained in the cleanup ledger and will be retried." } : {}),
      }, { status: 201, headers: { "cache-control": "no-store" } });
    });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    }
    if (error instanceof PrivateObjectLifecycleClaimError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 409 });
    }
    if (error instanceof ProductWorkspaceBusyError) {
      return NextResponse.json({ ok: false, error: error.message, code: "saved_tool_icon_busy" }, { status: 409 });
    }
    if (error instanceof SavedToolIconConflictError) return iconConflict();
    return authErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    await ensureHydrated();
    const who = await self(request);
    if (!who) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const { toolId } = await context.params;

    return await withPortalProviderLease(providerLane(who, toolId), async () => {
      const priorCleanupComplete = await retryPendingIconCleanup(who, toolId);
      const current = await withPortalStateTransaction(
        userChromeLayoutLockKey(who.agencyId, who.userId),
        () => getUserChromeLayout(who.agencyId, who.userId),
      );
      const tool = current.savedTools.find(candidate => candidate.id === toolId);
      if (!tool) return notFound();
      if (!tool.iconAsset) {
        return NextResponse.json({ ok: priorCleanupComplete, layout: current, cleanupPending: !priorCleanupComplete }, {
          status: priorCleanupComplete ? 200 : 503,
          headers: { "cache-control": "no-store" },
        });
      }

      const asset = tool.iconAsset;
      const objectId = deletionObjectId(who, toolId, asset);
      const requestHash = privateObjectRequestHash([
        DELETE_PURPOSE,
        who.agencyId,
        who.userId,
        toolId,
        asset.storageProvider,
        asset.storageKey,
      ]);
      const outcome = await withPortalStateTransaction(userChromeLayoutLockKey(who.agencyId, who.userId), async () => {
        const deletion = await deletePrivateObjectWithRecovery<SavedToolIconAsset>({
          agencyId: who.agencyId,
          purpose: DELETE_PURPOSE,
          objectId,
          requestHash,
          localDirectory: LOCAL_DIRECTORY,
          retryAfterMs: ICON_DELETE_RETRY_MS,
          prepare: (state: PortalState) => {
            const key = chromeLayoutKey(who.agencyId, who.userId);
            const latest = normaliseLayout(state.userChromeLayouts[key], who.agencyId, who.userId);
            const latestTool = latest.savedTools.find(candidate => candidate.id === toolId);
            if (!latestTool || !sameSavedToolIconAsset(latestTool.iconAsset, asset)) {
              throw new SavedToolIconConflictError();
            }
            const now = Math.max(Date.now(), latest.updatedAt + 1);
            state.userChromeLayouts[key] = normaliseLayout({
              ...latest,
              savedTools: latest.savedTools.map(candidate => candidate.id === toolId
                ? { ...candidate, iconAsset: undefined, updatedAt: now }
                : candidate),
              updatedAt: now,
            }, who.agencyId, who.userId);
            return {
              snapshot: asset,
              storageProvider: asset.storageProvider,
              storageKey: asset.storageKey,
              metadata: { userId: who.userId, toolId },
            };
          },
        });
        return { deletion, layout: getUserChromeLayout(who.agencyId, who.userId) };
      });
      if (!outcome.deletion.ok) {
        return NextResponse.json({
          ok: false,
          error: "The icon is detached, but its private copy could not yet be removed. Cleanup is safely queued; try again.",
          code: "saved_tool_icon_cleanup_pending",
          layout: outcome.layout,
          cleanupPending: true,
        }, { status: 503, headers: { "cache-control": "no-store" } });
      }
      if (!priorCleanupComplete) {
        return NextResponse.json({
          ok: false,
          error: "The current icon was removed, but an older private copy still needs cleanup. Try again.",
          code: "saved_tool_icon_cleanup_pending",
          layout: outcome.layout,
          cleanupPending: true,
        }, { status: 503, headers: { "cache-control": "no-store" } });
      }
      return NextResponse.json({ ok: true, layout: outcome.layout, cleanupPending: false }, {
        status: 200,
        headers: { "cache-control": "no-store" },
      });
    });
  } catch (error) {
    if (error instanceof ProductWorkspaceBusyError) {
      return NextResponse.json({ ok: false, error: error.message, code: "saved_tool_icon_busy" }, { status: 409 });
    }
    if (error instanceof SavedToolIconConflictError) return iconConflict();
    return authErrorResponse(error);
  }
}
