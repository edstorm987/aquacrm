import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { deletePrivateUpload } from "@/lib/server/privateUploadStorage";
import { deleteLegalDocument, getLegalDocument, listLegalDocuments, updateLegalDocument } from "@/server/legalDocuments";
import { ensureHydrated } from "@/server/storage";
import type { LegalDocument } from "@/server/types";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";
import { recordBelongsToCompany } from "@/server/tradingCompanies";

export async function GET() {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager", "agency-staff"]);
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
    // The record is the only handle on the stored file, so it is removed only
    // once the provider has actually removed the binary.
    const removal = await deletePrivateUpload({
      storageProvider: document.storageProvider,
      storageKey: document.storageKey,
      localDirectory: "legal-uploads",
    });
    if (!removal.ok) {
      return NextResponse.json({
        ok: false,
        code: "storage_delete_failed",
        error: `“${document.title}” is still stored — the storage provider refused to remove its file, so the document has been kept to retry.`,
        detail: removal.error,
      }, { status: 502 });
    }
    if (!deleteLegalDocument(session.agencyId, id)) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) { return authErrorResponse(error); }
}
