import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { attachStoredPrivateUpload, PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { createLegalDocument, rollbackLegalDocumentUpload } from "@/server/legalDocuments";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import type { LegalDocumentCategory, LegalDocumentStatus } from "@/server/types";
import { getActiveTradingCompanyId } from "@/lib/server/tradingCompanyContext";

export const runtime = "nodejs";
const MAX = 12 * 1024 * 1024;
const TYPES = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "image/jpeg", "image/png", "image/webp", "text/plain"]);

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const companyId = await getActiveTradingCompanyId(session.agencyId);
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: "Choose a document." }, { status: 400 });
    if (!file.size || file.size > MAX) return NextResponse.json({ ok: false, error: "Documents must be smaller than 12 MB." }, { status: 413 });
    if (!TYPES.has(file.type)) return NextResponse.json({ ok: false, error: "Upload a PDF, document, spreadsheet, text file, or image." }, { status: 415 });

    const id = `legal_${crypto.randomBytes(8).toString("hex")}`;
    const filename = file.name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 140) || "document";
    const pathname = `legal/${session.agencyId}/${id}-${filename}`;
    const relative = join(session.agencyId, `${id}-${filename}`);
    const stored = await storePrivateUpload({
      pathname,
      file,
      contentType: file.type,
      localDirectory: "legal-uploads",
      localKey: relative,
    });
    const date = (key: string) => {
      const value = String(form?.get(key) ?? "");
      return value ? Date.parse(value) || undefined : undefined;
    };
    const attached = await attachStoredPrivateUpload(
      stored,
      "legal-uploads",
      () => createLegalDocument({
        id,
        agencyId: session.agencyId,
        companyIds: companyId ? [companyId] : [],
        title: String(form?.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, ""),
        category: String(form?.get("category") ?? "other") as LegalDocumentCategory,
        status: String(form?.get("status") ?? "active") as LegalDocumentStatus,
        counterparty: String(form?.get("counterparty") ?? ""),
        reference: String(form?.get("reference") ?? ""),
        effectiveAt: date("effectiveAt"),
        expiresAt: date("expiresAt"),
        reminderAt: date("reminderAt"),
        notes: String(form?.get("notes") ?? ""),
        fileName: file.name.trim().slice(0, 200),
        contentType: file.type,
        size: file.size,
        storageProvider: stored.storageProvider,
        storageKey: stored.storageKey,
        createdBy: session.userId,
      }),
      {
        persist: flushPendingWrites,
        rollbackOwner: () => { rollbackLegalDocumentUpload(session.agencyId, id); },
      },
    );
    if (!attached.ok) {
      return NextResponse.json({
        ok: false,
        error: attached.message,
        code: attached.compensated ? "upload_record_failed" : "upload_orphaned",
        detail: attached.detail,
        storageKey: attached.compensated ? undefined : attached.storageKey,
      }, { status: 500 });
    }
    const document = attached.value;
    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    }
    return authErrorResponse(error);
  }
}
