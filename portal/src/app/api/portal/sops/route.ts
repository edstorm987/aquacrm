import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth/auth";
import { deletePrivateObjectWithRecovery, privateObjectDeletionCheckpoint, privateObjectLifecycleLockKey, privateObjectRequestHash, PrivateObjectLifecycleConflictError } from "@/lib/server/privateObjectLifecycle";
import { createInteractiveSop, createWrittenSop, getSop, listSopsWithPendingDeletion, updateSop } from "@/engines/sop/server/sops";
import {
  assertSopHasNoDependants,
  sopDependencyInventory,
  SopHasDependantsError,
} from "@/engines/sop/server/sopDependencies";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, type SopDocument } from "@/server/types";
import type { BlockTreeJSON } from "@/engines/editor/elements";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";

export const runtime = "nodejs";

async function agencySession(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
  return session;
}

export async function GET(request: NextRequest) {
  try {
    const session = await agencySession(request);
    // Retirement preview: `?dependencies=<id>` answers "what would still be
    // holding this id afterwards?" from the SAME inventory the DELETE command
    // enforces, so the confirmation UI explains the authoritative RESTRICT
    // policy rather than guessing from a different dependency scan.
    const dependenciesFor = new URL(request.url).searchParams.get("dependencies")?.trim();
    if (dependenciesFor) {
      if (!getSop(session.agencyId, dependenciesFor)) {
        return NextResponse.json({ ok: false, error: "SOP not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, dependencies: sopDependencyInventory(session.agencyId, dependenciesFor) });
    }
    return NextResponse.json({ ok: true, sops: listSopsWithPendingDeletion(session.agencyId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as {
      title?: string;
      content?: string;
      kind?: string;
      blocks?: BlockTreeJSON;
      category?: string;
      categories?: string[];
      tags?: string[];
    } | null;
    if (!body?.title?.trim()) {
      return NextResponse.json({ ok: false, error: "title required" }, { status: 400 });
    }
    // Additive: an interactive SOP composed from the element-engine block tree
    // is persisted through `createInteractiveSop`, which validates the tree
    // against the element schema (throws → 400 below). Everything else stays on
    // the written-SOP path exactly as before.
    if (body.kind === "interactive") {
      try {
        const sop = createInteractiveSop({
          agencyId: session.agencyId,
          title: body.title,
          blocks: Array.isArray(body.blocks) ? body.blocks : [],
          category: body.category,
          categories: body.categories,
          tags: body.tags,
          actorUserId: session.userId,
        });
        return NextResponse.json({ ok: true, sop }, { status: 201 });
      } catch (invalid) {
        return NextResponse.json({ ok: false, error: invalid instanceof Error ? invalid.message : "invalid blocks" }, { status: 400 });
      }
    }
    const sop = createWrittenSop({
      agencyId: session.agencyId,
      title: body.title,
      content: body.content ?? "",
      category: body.category,
      categories: body.categories,
      tags: body.tags,
      actorUserId: session.userId,
    });
    return NextResponse.json({ ok: true, sop }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const body = await request.json().catch(() => null) as {
      id?: string;
      title?: string;
      content?: string;
      blocks?: BlockTreeJSON;
      category?: string;
      categories?: string[];
      tags?: string[];
    } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const { id, ...patch } = body;
    // `updateSop` only honours `blocks` for an existing interactive SOP, and
    // validates the tree against the element schema (throws on an invalid one).
    try {
      // The authoritative read and write share the permanent-deletion lane;
      // otherwise a stale process can recreate the owner after its uploaded
      // binary has already been removed from the provider.
      const sop = await withPortalStateTransaction(
        privateObjectLifecycleLockKey(session.agencyId),
        () => updateSop(session.agencyId, id, patch, session.userId),
      );
      return sop
        ? NextResponse.json({ ok: true, sop })
        : NextResponse.json({ ok: false, error: "SOP not found" }, { status: 404 });
    } catch (invalid) {
      return NextResponse.json({ ok: false, error: invalid instanceof Error ? invalid.message : "invalid blocks" }, { status: 400 });
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await agencySession(request);
    const id = new URL(request.url).searchParams.get("id")?.trim();
    if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
    const checkpoint = privateObjectDeletionCheckpoint<SopDocument>(session.agencyId, "sop", id);
    const sop = getSop(session.agencyId, id) ?? checkpoint?.snapshot;
    if (!sop) return NextResponse.json({ ok: false, error: "SOP not found" }, { status: 404 });

    // New deletions are RESTRICT: keeping the source procedure is the only
    // lossless default while another operating record still names it. A
    // checkpoint means an older delete already removed the source row, so its
    // exact recovery/replay must still be allowed to converge.
    if (!checkpoint) {
      const dependencies = sopDependencyInventory(session.agencyId, id);
      if (dependencies.total > 0) throw new SopHasDependantsError(dependencies);
    }
    const result = await deletePrivateObjectWithRecovery<SopDocument>({
      agencyId: session.agencyId,
      purpose: "sop",
      objectId: id,
      requestHash: privateObjectRequestHash([session.agencyId, id, "permanent-delete"]),
      localDirectory: "sop-uploads",
      checkpointSnapshot: snapshot => ({
        ...snapshot,
        tags: [],
        content: undefined,
        blocks: undefined,
        fileName: undefined,
        contentType: undefined,
        size: undefined,
        storageKey: undefined,
      }),
      completedSnapshot: snapshot => ({ id: snapshot.id, agencyId: snapshot.agencyId, title: snapshot.title, createdBy: snapshot.createdBy }),
      prepare(state) {
        const current = state.sops[id];
        if (!current || current.agencyId !== session.agencyId) throw new Error("SOP not found");
        // Re-check beside the owner-row removal. The preview above explains the
        // refusal, while this closes a reference added between preview and lock.
        const dependencies = assertSopHasNoDependants(state, session.agencyId, id);
        delete state.sops[id];
        return { snapshot: current, storageProvider: current.storageProvider, storageKey: current.storageKey, metadata: { stranded: dependencies } };
      },
    });
    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        code: "storage_delete_failed",
        error: `“${sop.title}” is queued for recovery — retry the delete after the storage provider is available.`,
        detail: result.error,
        sop: getSop(session.agencyId, id),
      }, { status: 502 });
    }
    return NextResponse.json({ ok: true, stranded: result.metadata?.stranded });
  } catch (error) {
    if (error instanceof SopHasDependantsError) {
      return NextResponse.json({
        ok: false,
        reason: error.code,
        error: error.message,
        dependencies: error.inventory,
      }, { status: 422 });
    }
    if (error instanceof PrivateObjectLifecycleConflictError) return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 409 });
    return authErrorResponse(error);
  }
}
