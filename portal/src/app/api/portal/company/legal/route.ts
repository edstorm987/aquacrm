import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { deletePrivateUpload } from "@/lib/server/privateUploadStorage";
import { LegalDocumentInUseError, deleteLegalDocument, getLegalDocument, listLegalDocuments, restoreLegalDocument, updateLegalDocument } from "@/server/legalDocuments";
import { legalDocumentDependencyInventory } from "@/server/legalDocumentDependencies";
import { ensureHydrated } from "@/server/storage";
import type { LegalDocument } from "@/server/types";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";
import { recordBelongsToCompany } from "@/server/tradingCompanies";

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
    return NextResponse.json({ ok: true, documents: listLegalDocuments(session.agencyId).filter(document => recordBelongsToCompany(document.companyIds, companyId)) });
  } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as { id?: string; patch?: Partial<LegalDocument> } | null;
    if (!body?.id) return NextResponse.json({ ok: false, error: "Document required." }, { status: 400 });
    const document = updateLegalDocument(session.agencyId, body.id, body.patch ?? {}, session.userId);
    return document ? NextResponse.json({ ok: true, document }) : NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
  } catch (error) { return authErrorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ ok: false, error: "Document required." }, { status: 400 });
    const document = getLegalDocument(session.agencyId, id);
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

    // The store's own re-check is the AUTHORITATIVE one — the preview above can
    // go stale between the two — so it runs before the binary is touched. The
    // earlier ordering deleted the file first, and a citation appearing in that
    // window made the store refuse: the file was gone, the row survived, and the
    // 409 told the operator to "archive it to keep the evidence" that no longer
    // existed. Removing the row first means a refusal leaves BOTH intact.
    const purged = deleteLegalDocument(session.agencyId, id, { detach, actorUserId: session.userId });
    if (!purged) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });

    const removal = await deletePrivateUpload({
      storageProvider: document.storageProvider,
      storageKey: document.storageKey,
      localDirectory: "legal-uploads",
    });
    if (!removal.ok) {
      // Compensate: the row goes back so the file keeps its only handle and the
      // delete can be retried. A detach purge has already cleared its citations
      // and cannot re-link them, so that residue is named rather than implied
      // away — reporting a clean rollback here would be the same class of lie
      // this reordering removes.
      const restored = restoreLegalDocument(purged.document);
      const detachedResidue = purged.detached.length;
      return NextResponse.json({
        ok: false,
        code: "storage_delete_failed",
        error: restored
          ? `“${document.title}” is still stored — the storage provider refused to remove its file, so the document has been kept to retry.`
          : `“${document.title}” could not be removed from storage, and its register row could not be restored. The stored file remains at ${document.storageKey}.`,
        detail: removal.error,
        ...(detachedResidue
          ? { detachedNotRelinked: purged.detached, warning: `${detachedResidue === 1 ? "1 citation was" : `${detachedResidue} citations were`} already detached and must be re-linked by hand.` }
          : {}),
      }, { status: 502 });
    }
    return NextResponse.json({ ok: true, detached: purged.detached });
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
    return authErrorResponse(error);
  }
}

function describeDependants(total: number): string {
  return total === 1 ? "1 record" : `${total} records`;
}
