import crypto from "node:crypto";
import { NextResponse } from "next/server";

import {
  CLIENT_RECORD_ENTRY_KINDS,
  cleanClientRecordEntries,
  cleanRecordText,
  cleanRecordTimestamp,
  safeRecordUrl,
  type ClientRecordEntry,
  type ClientRecordEntryKind,
  type ClientRecordVisibility,
} from "@/lib/clients/clientRelationshipRecord";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { removeClientRecordLedgerEvent, upsertClientRecordLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import { logActivity } from "@/server/activity";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { AGENCY_ROLES } from "@/server/types";
import { ProductWorkspaceBusyError, withClientMetadataLedgerTransaction } from "@/server/productWorkspaceCoordinator";
import { requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";

type AddBody = {
  clientId?: unknown;
  action?: "add";
  entry?: {
    kind?: unknown;
    title?: unknown;
    body?: unknown;
    occurredAt?: unknown;
    visibility?: unknown;
    channel?: unknown;
    url?: unknown;
  };
};

type UpdateBody = {
  clientId?: unknown;
  action?: "update";
  entryId?: unknown;
  patch?: {
    title?: unknown;
    body?: unknown;
    occurredAt?: unknown;
    visibility?: unknown;
    channel?: unknown;
    url?: unknown;
  };
};

type DeleteBody = { clientId?: unknown; action?: "delete"; entryId?: unknown };
type Body = AddBody | UpdateBody | DeleteBody;

function makeId(): string {
  return `rec_${crypto.randomBytes(8).toString("hex")}`;
}

function visibility(value: unknown): ClientRecordVisibility {
  return value === "client" ? "client" : "internal";
}

export async function POST(request: Request) {
  try {
    await ensureHydrated();
    const body = await request.json().catch(() => null) as Body | null;
    const clientId = cleanRecordText(body?.clientId, 120);
    if (!clientId || !body?.action) {
      return NextResponse.json({ ok: false, error: "clientId and action are required" }, { status: 400 });
    }

    const session = await requireRoleForClient([...AGENCY_ROLES], clientId);
    // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
    if (!getClientForAgency(session.agencyId, clientId)) {
      return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    }
    await requireCurrentClientWorkspaceElementAccess(clientId, "client.record", "use");
    return await withClientMetadataLedgerTransaction({ agencyId: session.agencyId, clientId, ledger: "record" }, async () => {
    const client = getClientForAgency(session.agencyId, clientId);
    if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

    const metadata = client.metadata ?? {};
    const entries = cleanClientRecordEntries(metadata.clientRecordEntries);
    const files = Array.isArray(metadata.files) ? metadata.files : [];
    let next: ClientRecordEntry[];
    let changed: ClientRecordEntry | undefined;

    if (body.action === "add") {
      const input = body.entry;
      const kind = CLIENT_RECORD_ENTRY_KINDS.includes(input?.kind as ClientRecordEntryKind)
        ? input?.kind as ClientRecordEntryKind
        : null;
      const title = cleanRecordText(input?.title, 240);
      if (!kind || !title) {
        return NextResponse.json({ ok: false, error: "record type and title are required" }, { status: 400 });
      }
      const now = Date.now();
      changed = {
        id: makeId(),
        kind,
        title,
        body: cleanRecordText(input?.body, 20_000) || undefined,
        occurredAt: cleanRecordTimestamp(input?.occurredAt, now),
        createdAt: now,
        updatedAt: now,
        createdBy: session.email,
        visibility: visibility(input?.visibility),
        channel: cleanRecordText(input?.channel, 120) || undefined,
        url: safeRecordUrl(input?.url),
      };
      next = [changed, ...entries];
    } else if (body.action === "update") {
      const entryId = cleanRecordText(body.entryId, 160);
      const existing = entries.find(entry => entry.id === entryId);
      if (!existing) return NextResponse.json({ ok: false, error: "record not found" }, { status: 404 });
      changed = {
        ...existing,
        title: body.patch?.title === undefined ? existing.title : cleanRecordText(body.patch.title, 240) || existing.title,
        body: body.patch?.body === undefined ? existing.body : cleanRecordText(body.patch.body, 20_000) || undefined,
        occurredAt: body.patch?.occurredAt === undefined ? existing.occurredAt : cleanRecordTimestamp(body.patch.occurredAt, existing.occurredAt),
        visibility: body.patch?.visibility === undefined ? existing.visibility : visibility(body.patch.visibility),
        channel: body.patch?.channel === undefined ? existing.channel : cleanRecordText(body.patch.channel, 120) || undefined,
        url: body.patch?.url === undefined ? existing.url : safeRecordUrl(body.patch.url),
        updatedAt: Date.now(),
      };
      next = entries.map(entry => entry.id === changed?.id ? changed : entry);
    } else if (body.action === "delete") {
      const entryId = cleanRecordText(body.entryId, 160);
      changed = entries.find(entry => entry.id === entryId);
      if (!changed) return NextResponse.json({ ok: false, error: "record not found" }, { status: 404 });
      next = entries.filter(entry => entry.id !== entryId);
    } else {
      return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
    }

    const nextFiles = body.action === "delete" && changed
      ? files.map(file => file && typeof file === "object" && "recordEntryId" in file && file.recordEntryId === changed?.id
        ? { ...file, recordEntryId: undefined }
        : file)
      : files;
    const updated = updateClient(session.agencyId, clientId, {
      metadata: {
        clientRecordEntries: next,
        ...(body.action === "delete" ? { files: nextFiles } : {}),
      },
    });
    if (!updated) return NextResponse.json({ ok: false, error: "record could not be saved" }, { status: 500 });
    const ledgerEvent = body.action === "delete" && changed
      ? (removeClientRecordLedgerEvent(session.agencyId, clientId, "record-entry", changed.id), undefined)
      : changed
        ? upsertClientRecordLedgerEvent(session.agencyId, clientId, {
            sourceType: "record-entry",
            sourceId: changed.id,
            group: changed.kind === "call" || changed.kind === "meeting" ? "calls" : changed.kind === "update" ? "activity" : "notes",
            title: changed.title,
            body: changed.body,
            occurredAt: changed.occurredAt,
            eyebrow: `${changed.kind.replaceAll("-", " ")}${changed.channel ? ` · ${changed.channel}` : ""}`,
            visibility: changed.visibility,
            href: changed.url,
          })
        : undefined;
    logActivity({
      agencyId: session.agencyId,
      clientId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "tenant",
      action: `client_record.${body.action}`,
      message: `${body.action === "delete" ? "Removed" : body.action === "update" ? "Updated" : "Added"} ${changed?.kind ?? "client"} record “${changed?.title ?? "Untitled"}”.`,
      metadata: { entryId: changed?.id, kind: changed?.kind, visibility: changed?.visibility },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, entry: changed, ledgerEvent, entries: next, files: nextFiles });
    });
  } catch (error) {
    if (error instanceof ProductWorkspaceBusyError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 409 });
    }
    return authErrorResponse(error);
  }
}
