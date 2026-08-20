import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { createLegalDocument } from "@/server/legalDocuments";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { listTradingCompanies } from "@/server/tradingCompanies";
import type { LegalDocumentCategory, LegalDocumentStatus } from "@/server/types";

const CATEGORIES: readonly LegalDocumentCategory[] = ["contract", "insurance", "hmrc", "letter", "template", "policy", "company", "other"];
const STATUSES: readonly LegalDocumentStatus[] = ["draft", "active", "action-required", "expired", "archived"];

/**
 * Add a record to the legal register from the Governance workspace.
 *
 * Owner/manager only. This creates a register ENTRY — it does not upload or
 * verify a file, and it must never be read as evidence that a document has been
 * checked. The register is the index of what should exist; the posture stays
 * honest that it has not read any document's contents.
 *
 * The reserved framework-declaration prefix is stripped by `createLegalDocument`
 * itself, so a hand-written reference here cannot switch a framework on.
 */
export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole(["agency-owner", "agency-manager"]);
    const body = await request.json().catch(() => null) as {
      title?: string;
      category?: string;
      status?: string;
      counterparty?: string;
      reference?: string;
      effectiveAt?: number;
      expiresAt?: number;
      notes?: string;
      companyId?: string | null;
    } | null;

    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ ok: false, error: "Give the record a title." }, { status: 400 });

    const category = CATEGORIES.includes(body?.category as LegalDocumentCategory) ? body!.category as LegalDocumentCategory : "other";
    const status = STATUSES.includes(body?.status as LegalDocumentStatus) ? body!.status as LegalDocumentStatus : "active";

    const companyId = typeof body?.companyId === "string" && body.companyId ? body.companyId : null;
    if (companyId && !listTradingCompanies(session.agencyId, true).some(company => company.id === companyId)) {
      return NextResponse.json({ ok: false, error: "That company was not found." }, { status: 404 });
    }

    const document = createLegalDocument({
      id: `legal_${crypto.randomBytes(8).toString("hex")}`,
      agencyId: session.agencyId,
      companyIds: companyId ? [companyId] : [],
      title,
      category,
      status,
      counterparty: typeof body?.counterparty === "string" ? body.counterparty : undefined,
      reference: typeof body?.reference === "string" ? body.reference : undefined,
      effectiveAt: typeof body?.effectiveAt === "number" ? body.effectiveAt : undefined,
      expiresAt: typeof body?.expiresAt === "number" ? body.expiresAt : undefined,
      notes: typeof body?.notes === "string" ? body.notes : undefined,
      // A register entry with no uploaded file — the posture never treats a bare
      // entry as verified evidence.
      fileName: title,
      contentType: "text/plain",
      size: 0,
      storageProvider: "local",
      storageKey: "",
      createdBy: session.userId,
    });
    await flushPendingWrites();

    return NextResponse.json({ ok: true, documentId: document.id });
  } catch (error) {
    return authErrorResponse(error);
  }
}
