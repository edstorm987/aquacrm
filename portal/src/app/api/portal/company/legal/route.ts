import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { del } from "@vercel/blob";
import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { deleteSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { deleteLegalDocument, listLegalDocuments, updateLegalDocument } from "@/server/legalDocuments";
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
    const document = deleteLegalDocument(session.agencyId, id);
    if (!document) return NextResponse.json({ ok: false, error: "Document not found." }, { status: 404 });
    if (document.storageProvider === "supabase") await deleteSupabasePrivateUpload(document.storageKey).catch(() => false);
    else if (document.storageProvider === "vercel-blob") await del(document.storageKey).catch(() => undefined);
    else {
      const root = resolve(process.cwd(), ".data", "legal-uploads");
      const path = resolve(root, document.storageKey);
      if (path.startsWith(`${root}/`)) await rm(path, { force: true }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return authErrorResponse(error); }
}
