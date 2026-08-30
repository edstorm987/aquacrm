import crypto from "crypto";
import { NextResponse } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { AGENCY_ROLES, CLIENT_ROLES, isAgencyRole } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import { contractHasReviewableTerms, type ClientContract, type ClientContractRevision } from "@/lib/clients/clientContracts";
import {
  removeClientRecordLedgerEvent,
  upsertClientContractLedgerEvent,
} from "@/lib/server/clients/clientRecordLedger";
import { deliverContractToClient } from "@/lib/server/clients/contractDelivery";
import type { TransactionalEmailResult } from "@/lib/server/email/transactionalEmail";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

type Action = "create" | "update" | "send" | "accept" | "decline" | "delete";

interface Body {
  clientId?: unknown;
  action?: unknown;
  contractId?: unknown;
  title?: unknown;
  summary?: unknown;
  body?: unknown;
  documentUrl?: unknown;
  documentName?: unknown;
  templateId?: unknown;
  amendmentNote?: unknown;
  operationId?: unknown;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanUrl(value: unknown, clientId: string): string | undefined {
  const raw = cleanText(value, 2_000);
  if (!raw) return undefined;
  if (raw.startsWith("/")) {
    try {
      const url = new URL(raw, "http://aquacrm.local");
      if (
        url.pathname === "/api/tenants/client-files/content"
        && url.searchParams.get("clientId") === clientId
        && Boolean(url.searchParams.get("fileId"))
      ) {
        return `${url.pathname}?${url.searchParams.toString()}`;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function cleanOperationId(value: unknown): string {
  const cleaned = cleanText(value, 180);
  return cleaned && /^[a-zA-Z0-9._:-]+$/.test(cleaned) ? cleaned : "";
}

function creationFingerprint(input: {
  title: string;
  summary: string;
  body: string;
  documentUrl?: string;
  documentName: string;
  templateId: string;
}): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function contractIdFor(agencyId: string, clientId: string, operationId: string): string {
  return `ctr_${crypto.createHash("sha256").update(`${agencyId}\u0000${clientId}\u0000${operationId}`).digest("hex").slice(0, 24)}`;
}

export async function POST(req: Request) {
  await ensureHydrated();
  const body = await req.json().catch(() => null) as Body | null;
  const clientId = cleanText(body?.clientId, 120);
  const action = cleanText(body?.action, 30) as Action;
  if (!clientId || !["create", "update", "send", "accept", "decline", "delete"].includes(action)) {
    return NextResponse.json({ ok: false, error: "clientId + valid action required" }, { status: 400 });
  }

  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"], clientId);
  } catch (error) {
    return authErrorResponse(error);
  }
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

  const agencyUser = isAgencyRole(session.role);
  if (!agencyUser && !["accept", "decline"].includes(action)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    await requireCurrentClientWorkspaceElementAccess(
      clientId,
      "client.commercial",
      action === "delete" ? "manage" : "use",
    );
  } catch (error) {
    return authErrorResponse(error);
  }

  const meta = (client.metadata ?? {}) as { contracts?: ClientContract[] };
  const contracts = Array.isArray(meta.contracts) ? [...meta.contracts] : [];
  const now = Date.now();
  let message = "";
  let activityAction = "";
  let contractForDelivery: ClientContract | null = null;
  let replayed = false;

  if (action === "create") {
    const title = cleanText(body?.title, 180);
    const summary = cleanText(body?.summary, 2_000);
    const contractBody = cleanText(body?.body, 50_000);
    const suppliedUrl = cleanText(body?.documentUrl, 2_000);
    const documentUrl = cleanUrl(body?.documentUrl, clientId);
    const documentName = cleanText(body?.documentName, 200);
    const templateId = cleanText(body?.templateId, 120);
    const operationId = cleanOperationId(body?.operationId);
    if (!title) return NextResponse.json({ ok: false, error: "agreement title required" }, { status: 400 });
    if (!operationId) return NextResponse.json({ ok: false, error: "contract operation id required" }, { status: 400 });
    if (suppliedUrl && !documentUrl) {
      return NextResponse.json({ ok: false, error: "document link must use http or https" }, { status: 400 });
    }
    const fingerprint = creationFingerprint({
      title,
      summary,
      body: contractBody,
      documentUrl,
      documentName,
      templateId,
    });
    const stableId = contractIdFor(session.agencyId, clientId, operationId);
    const existing = contracts.find(contract =>
      contract.id === stableId || contract.creationOperationId === operationId);
    if (existing) {
      if (existing.creationFingerprint !== fingerprint) {
        return NextResponse.json({
          ok: false,
          error: "That contract save was already used for different terms. Start a new contract instead.",
          contract: existing,
          contracts,
        }, { status: 409 });
      }
      await flushPendingWrites();
      return NextResponse.json({ ok: true, replayed: true, contract: existing, contracts });
    }
    const contract: ClientContract = {
      id: stableId,
      creationOperationId: operationId,
      creationFingerprint: fingerprint,
      title,
      summary: summary || undefined,
      body: contractBody || undefined,
      documentUrl,
      documentName: documentName || undefined,
      templateId: templateId || undefined,
      version: 1,
      revisions: [],
      status: "draft",
      createdAt: now,
      updatedAt: now,
    };
    contracts.unshift(contract);
    message = `Created agreement “${title}” for ${client.name}.`;
    activityAction = "contract.created";
  } else {
    const contractId = cleanText(body?.contractId, 120);
    const index = contracts.findIndex(contract => contract.id === contractId);
    if (index < 0) return NextResponse.json({ ok: false, error: "agreement not found" }, { status: 404 });
    const current = contracts[index];

    if (action === "update") {
      if (!agencyUser) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      const title = cleanText(body?.title, 180);
      const summary = cleanText(body?.summary, 2_000);
      const contractBody = cleanText(body?.body, 50_000);
      const suppliedUrl = cleanText(body?.documentUrl, 2_000);
      const documentUrl = cleanUrl(body?.documentUrl, clientId);
      const documentName = cleanText(body?.documentName, 200);
      const templateId = cleanText(body?.templateId, 120);
      const amendmentNote = cleanText(body?.amendmentNote, 500);
      if (!title) return NextResponse.json({ ok: false, error: "agreement title required" }, { status: 400 });
      if (suppliedUrl && !documentUrl) {
        return NextResponse.json({ ok: false, error: "document link must use http or https" }, { status: 400 });
      }
      const priorVersion = current.version ?? 1;
      const revision: ClientContractRevision = {
        version: priorVersion,
        title: current.title,
        summary: current.summary,
        body: current.body,
        documentUrl: current.documentUrl,
        documentName: current.documentName,
        templateId: current.templateId,
        note: amendmentNote || undefined,
        createdAt: now,
        createdBy: session.email,
      };
      contracts[index] = {
        ...current,
        title,
        summary: summary || undefined,
        body: contractBody || undefined,
        documentUrl,
        documentName: documentName || undefined,
        templateId: templateId || undefined,
        version: priorVersion + 1,
        revisions: [...(current.revisions ?? []), revision],
        status: "draft",
        issuedAt: undefined,
        acceptedAt: undefined,
        acceptedBy: undefined,
        acceptedVersion: undefined,
        declinedAt: undefined,
        declinedBy: undefined,
        updatedAt: now,
      };
      message = `Amended agreement “${current.title}” for ${client.name} as version ${priorVersion + 1}.`;
      activityAction = "contract.amended";
    } else if (action === "send") {
      if (!agencyUser) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      if (!contractHasReviewableTerms(current)) {
        return NextResponse.json({ ok: false, error: "write terms or attach a document before sending" }, { status: 409 });
      }
      contracts[index] = { ...current, status: "sent", issuedAt: now, updatedAt: now };
      contractForDelivery = contracts[index];
      message = `Sent agreement “${current.title}” to ${client.name}.`;
      activityAction = "contract.sent";
    } else if (action === "accept") {
      if (current.status !== "sent") {
        return NextResponse.json({ ok: false, error: "only a sent agreement can be accepted" }, { status: 409 });
      }
      // Nobody can agree to a title. A record that reached "sent" without terms
      // (an older one-button close did exactly that) is refused here too, so the
      // gate holds for agreements already sitting in a client's portal.
      if (!contractHasReviewableTerms(current)) {
        return NextResponse.json({ ok: false, error: "this agreement has no terms to review yet — ask for the terms before accepting" }, { status: 409 });
      }
      contracts[index] = {
        ...current,
        status: "accepted",
        acceptedAt: now,
        acceptedBy: session.email,
        // Bind the acceptance to the exact wording that was on screen. An
        // amendment bumps the version and resets to draft, so a later version
        // can never inherit this acceptance.
        acceptedVersion: current.version ?? 1,
        declinedAt: undefined,
        declinedBy: undefined,
        updatedAt: now,
      };
      message = `${session.email} accepted version ${current.version ?? 1} of agreement “${current.title}”.`;
      activityAction = "contract.accepted";
    } else if (action === "decline") {
      if (current.status !== "sent") {
        return NextResponse.json({ ok: false, error: "only a sent agreement can be declined" }, { status: 409 });
      }
      contracts[index] = {
        ...current,
        status: "declined",
        declinedAt: now,
        declinedBy: session.email,
        acceptedAt: undefined,
        acceptedBy: undefined,
        acceptedVersion: undefined,
        updatedAt: now,
      };
      message = `${session.email} declined agreement “${current.title}”.`;
      activityAction = "contract.declined";
    } else {
      if (!agencyUser) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
      if (current.status !== "draft") {
        return NextResponse.json({ ok: false, error: "only draft agreements can be deleted" }, { status: 409 });
      }
      contracts.splice(index, 1);
      message = `Deleted draft agreement “${current.title}”.`;
      activityAction = "contract.deleted";
    }
  }

  const updated = updateClient(session.agencyId, clientId, { metadata: { contracts } });
  if (!updated) return NextResponse.json({ ok: false, error: "agreement update failed" }, { status: 500 });
  const changedContractId = action === "create" ? contracts[0]?.id : cleanText(body?.contractId, 120);
  const changedContract = changedContractId ? contracts.find(contract => contract.id === changedContractId) : undefined;
  if (action === "delete" && changedContractId) {
    removeClientRecordLedgerEvent(session.agencyId, clientId, "contract", `contract:${changedContractId}`);
  } else if (changedContract) {
    upsertClientContractLedgerEvent(session.agencyId, clientId, changedContract);
  }

  logActivity({
    idempotencyKey: action === "create"
      ? `client-contract:${session.agencyId}:${clientId}:${cleanOperationId(body?.operationId)}`
      : undefined,
    agencyId: session.agencyId,
    clientId,
    actorUserId: session.userId,
    actorEmail: session.email,
    category: "finance",
    action: activityAction,
    message,
    metadata: changedContractId ? { contractId: changedContractId } : undefined,
  });

  let delivery: TransactionalEmailResult | undefined;
  if (contractForDelivery) {
    ({ delivery } = await deliverContractToClient({
      agencyId: session.agencyId,
      clientId,
      client,
      contract: contractForDelivery,
      origin: new URL(req.url).origin,
      actorUserId: session.userId,
      actorEmail: session.email,
      signal: req.signal,
    }));
  }

  await flushPendingWrites();

  return NextResponse.json({ ok: true, replayed, contract: changedContract, contracts, delivery });
}
