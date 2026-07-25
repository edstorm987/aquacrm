import { NextResponse } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";

export type ClientApprovalType = "design" | "launch";
export type ClientApprovalStatus = "pending" | "approved" | "changes-requested";

export interface ClientApproval {
  id: string;
  type: ClientApprovalType;
  title: string;
  detail?: string;
  status: ClientApprovalStatus;
  requestedAt: number;
  requestedBy: string;
  respondedAt?: number;
  respondedBy?: string;
  responseNote?: string;
}

interface Body {
  clientId?: unknown;
  action?: unknown;
  type?: unknown;
  approvalId?: unknown;
  detail?: unknown;
  responseNote?: unknown;
}

function makeId() {
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  return c?.randomUUID
    ? `approval_${c.randomUUID()}`
    : `approval_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function approvalTitle(type: ClientApprovalType) {
  return type === "design" ? "Design approval" : "Launch approval";
}

export async function POST(req: Request) {
  try {
    await ensureHydrated();
    const body = await req.json().catch(() => null) as Body | null;
    const clientId = typeof body?.clientId === "string" ? body.clientId : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!clientId || !action) {
      return NextResponse.json({ ok: false, error: "clientId and action are required" }, { status: 400 });
    }

    if (action === "request") {
      const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
      const type = body?.type === "design" || body?.type === "launch" ? body.type : null;
      if (!type) return NextResponse.json({ ok: false, error: "valid approval type required" }, { status: 400 });
      const client = getClientForAgency(session.agencyId, clientId);
      if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

      const meta = (client.metadata ?? {}) as { portalApprovals?: ClientApproval[] };
      const approvals = Array.isArray(meta.portalApprovals) ? [...meta.portalApprovals] : [];
      if (approvals.some(item => item.type === type && item.status === "pending")) {
        return NextResponse.json({ ok: false, error: `${approvalTitle(type)} is already waiting for a response.` }, { status: 409 });
      }
      const item: ClientApproval = {
        id: makeId(),
        type,
        title: approvalTitle(type),
        detail: typeof body?.detail === "string" ? body.detail.trim().slice(0, 2_000) || undefined : undefined,
        status: "pending",
        requestedAt: Date.now(),
        requestedBy: session.email,
      };
      const next = [item, ...approvals];
      const saved = updateClient(session.agencyId, client.id, { metadata: { portalApprovals: next } });
      if (!saved) return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
      logActivity({
        agencyId: session.agencyId,
        clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "fulfillment",
        action: `client_approval.${type}.requested`,
        message: `${approvalTitle(type)} was sent to ${client.name}.`,
        metadata: { approvalId: item.id, approvalType: type },
      });
      return NextResponse.json({ ok: true, approval: item, approvals: next });
    }

    if (action === "approve" || action === "request-changes") {
      const session = await requireRoleForClient(["end-customer"], clientId);
      const approvalId = typeof body?.approvalId === "string" ? body.approvalId : "";
      if (!approvalId) return NextResponse.json({ ok: false, error: "approvalId required" }, { status: 400 });
      const client = getClientForAgency(session.agencyId, clientId);
      if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
      const meta = (client.metadata ?? {}) as { portalApprovals?: ClientApproval[] };
      const approvals = Array.isArray(meta.portalApprovals) ? [...meta.portalApprovals] : [];
      const existing = approvals.find(item => item.id === approvalId);
      if (!existing) return NextResponse.json({ ok: false, error: "approval not found" }, { status: 404 });
      if (existing.status !== "pending") {
        return NextResponse.json({ ok: false, error: "approval has already been answered" }, { status: 409 });
      }

      const changed: ClientApproval = {
        ...existing,
        status: action === "approve" ? "approved" : "changes-requested",
        respondedAt: Date.now(),
        respondedBy: session.email,
        responseNote: typeof body?.responseNote === "string"
          ? body.responseNote.trim().slice(0, 2_000) || undefined
          : undefined,
      };
      const next = approvals.map(item => item.id === changed.id ? changed : item);
      const saved = updateClient(session.agencyId, client.id, { metadata: { portalApprovals: next } });
      if (!saved) return NextResponse.json({ ok: false, error: "save failed" }, { status: 500 });
      logActivity({
        agencyId: session.agencyId,
        clientId,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "feedback",
        action: `client_approval.${existing.type}.${changed.status}`,
        message: `${client.name} ${changed.status === "approved" ? "approved" : "requested changes to"} the ${existing.type}.`,
        metadata: { approvalId: changed.id, approvalType: existing.type },
      });
      return NextResponse.json({ ok: true, approval: changed, approvals: next });
    }

    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
