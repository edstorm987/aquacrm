import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { deletePrivateObjectWithRecovery, privateObjectDeletionCheckpoint, privateObjectLifecycleLockKey, privateObjectRequestHash, PrivateObjectLifecycleConflictError } from "@/lib/server/privateObjectLifecycle";
import { LegalDocumentInUseError, getLegalDocument, listLegalDocumentsWithPendingDeletion, updateLegalDocument } from "@/server/legalDocuments";
import { applyLegalDocumentDetach, collectLegalDocumentDependants, legalDocumentDependencyInventory, type LegalDocumentDependant } from "@/server/legalDocumentDependencies";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { LegalDocument } from "@/server/types";
import { logActivity } from "@/server/activity";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";
import { recordBelongsToCompany } from "@/server/tradingCompanies";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
    // Removal preview: `?dependencies=<id>` answers "what would still be citing
    // this document afterwards?" from the SAME inventory the DELETE guard uses,
    // so the confirmation dialog and the server command ask one implementation
    // rather than each guessing.
    const dependenciesFor = new URL(request.url).searchParams.get("dependencies")?.trim();
    if (dependenciesFor) {
      if (!getLegalDocument(session.agencyId, dependenciesFor)) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
      return NextResponse.json({ ok: true, dependencies: legalDocumentDependencyInventory(session.agencyId, dependenciesFor) });
    }
    const companyId = await getActiveTradingCompanyId(session.agencyId);
    return NextResponse.json({ ok: true, documents: listLegalDocumentsWithPendingDeletion(session.agencyId).filter(document => recordBelongsToCompany(document.companyIds, companyId)) });
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as { id?: string; patch?: Partial<LegalDocument> } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "Document required." }, { status: 400 });
    // A legal record owns private provider bytes. Re-read and update it in the
    // same lifecycle lane as permanent deletion so a stale worker cannot
    // restore the owner row after the provider has removed the file.
    const document = await withPortalStateTransaction(
      privateObjectLifecycleLockKey(session.agencyId),
      () => updateLegalDocument(session.agencyId, body.id!, body.patch ?? {}, session.userId),
    );
    return document ? NextResponse.json({ ok: true, document }) : NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  } catch (error) { return authErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "Document required." }, { status: 400 });
    const document = getLegalDocument(session.agencyId, id)
      ?? privateObjectDeletionCheckpoint<LegalDocument>(session.agencyId, "legal-document", id)?.snapshot;
    if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });

    // Filed evidence that something still cites is not deleted on a click.
    // Archiving is the default answer (PATCH status), and a permanent purge
    // has to say out loud that it is detaching the citations — checked BEFORE
    // the binary is touched, so a refusal leaves the file exactly where it was.
    const detach = new URL(request.url).searchParams.get("detach") === "true";
    const dependencies = legalDocumentDependencyInventory(session.agencyId, id);
    if (dependencies.total && !detach) {
      return NextResponse.json({
        ok: false,
        code: "legal_document_in_use",
        error: `“${document.title}” was not deleted — ${describeDependants(dependencies.total)} still cite it. Archive it to keep the evidence, or confirm the detach to clear those citations first.`,
        dependencies,
      }, { status: 409 });
    }

    const result = await deletePrivateObjectWithRecovery<LegalDocument>({
      agencyId: session.agencyId,
      purpose: "legal-document",
      objectId: id,
      requestHash: privateObjectRequestHash([session.agencyId, id, detach]),
      localDirectory: "legal-uploads",
      checkpointSnapshot: snapshot => ({
        ...snapshot,
        counterparty: undefined,
        reference: undefined,
        notes: undefined,
        fileName: "",
        contentType: "application/octet-stream",
        size: 0,
        storageKey: "",
      }),
      completedSnapshot: snapshot => ({ id: snapshot.id, agencyId: snapshot.agencyId, title: snapshot.title, createdBy: snapshot.createdBy }),
      prepare(state) {
        const current = state.legalDocuments[id];
        if (!current || current.agencyId !== session.agencyId) throw new Error("Document not found.");
        const currentDependants = collectLegalDocumentDependants(state, session.agencyId, id);
        if (currentDependants.length && !detach) throw new LegalDocumentInUseError(current, currentDependants);
        const detached = detach ? applyLegalDocumentDetach(state, session.agencyId, id) : [];
        delete state.legalDocuments[id];
        return { snapshot: current, storageProvider: current.storageProvider, storageKey: current.storageKey, metadata: { detached, detach } };
      },
    });
    const detached = Array.isArray(result.metadata?.detached) ? result.metadata.detached as LegalDocumentDependant[] : [];
    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        code: "storage_delete_failed",
        error: `“${document.title}” is queued for recovery — the storage provider refused to remove its file. Retry the delete; Aqua retained the exact checkpoint rather than reporting success.`,
        detail: result.error,
        document: getLegalDocument(session.agencyId, id),
      }, { status: 502 });
    }
    if (!result.replayed) logActivity({
      agencyId: session.agencyId,
      actorUserId: session.userId,
      category: "settings",
      action: "legal.document_deleted",
      message: detached.length
        ? `Permanently deleted legal document "${result.snapshot.title}" and detached ${detached.length} citation${detached.length === 1 ? "" : "s"}.`
        : `Permanently deleted legal document "${result.snapshot.title}".`,
      metadata: { documentId: result.snapshot.id, detachedCount: String(detached.length) },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, detached });
  } catch (error) {
    // A dependant appearing between the preview and the transaction is a race,
    // not a bug — the store answers with the same refusal rather than purging.
    if (error instanceof LegalDocumentInUseError) {
      return NextResponse.json({
        ok: false,
        code: "legal_document_in_use",
        error: error.message,
        dependencies: { documentId: error.document.id, dependants: error.dependants, total: error.dependants.length, byKind: {} },
      }, { status: 409 });
    }
    if (error instanceof PrivateObjectLifecycleConflictError) {
      return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}

function describeDependants(total: number): string {
  return total === 1 ? "1 record" : `${total} records`;
}
