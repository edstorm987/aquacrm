import { NextResponse } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import { deletePrivateUpload } from "@/lib/server/privateUploadStorage";
import { cleanClientPaymentPlans } from "@/lib/clients/clientPaymentPlans";
import { cleanClientRecordEntries } from "@/lib/clients/clientRelationshipRecord";
import { removeClientRecordLedgerEvent, upsertClientFileLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import { clientFileWorkspaceElementKey, requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";
import {
  beginClientFileDeletion,
  failClientFileDeletion,
  finishClientFileDeletion,
} from "@/lib/clients/clientFileDeletion";

export const runtime = "nodejs";

export type FileCategory = "brand" | "brief" | "recording" | "inspiration" | "design-feedback" | "preview" | "deliverable" | "invoice" | "contract" | "payment-plan" | "payment-proof" | "proposal" | "legal" | "misc";
const CATEGORIES: readonly FileCategory[] = ["brand", "brief", "recording", "inspiration", "design-feedback", "preview", "deliverable", "invoice", "contract", "payment-plan", "payment-proof", "proposal", "legal", "misc"];

export interface ClientFileRef {
  id: string;
  name: string;
  url: string;
  category: FileCategory;
  uploadedBy?: string;
  uploadedAt: number;
  size?: number;
  contentType?: string;
  /** SHA-256 calculated by the server before storage; binds retry to bytes. */
  contentSha256?: string;
  storageProvider?: "supabase" | "vercel-blob" | "local";
  storageKey?: string;
  productId?: string;
  workspacePageId?: string;
  collectionId?: string;
  /** Stable, collection-scoped retry identity for mounted batch uploads. */
  uploadKey?: string;
  /** A workspace upload is complete only after its collection asset converges. */
  workspaceAttachmentState?: "pending" | "attached";
  recordEntryId?: string;
  customerVisible?: boolean;
  /**
   * Set when the provider refused to remove the binary. The record is kept —
   * with its `storageKey` — so the file is still listed, still reconcilable and
   * can be retried, rather than vanishing from the portal while the object
   * lives on in storage.
   */
  deleteState?: "deleting" | "delete-failed";
  deleteError?: string;
  deleteStartedAt?: number;
  deleteFailedAt?: number;
}

interface AddBody {
  clientId: string;
  action: "add";
  file: {
    name: string;
    url: string;
    category: FileCategory;
    uploadedBy?: string;
    productId?: string;
    workspacePageId?: string;
    collectionId?: string;
    recordEntryId?: string;
    customerVisible?: boolean;
  };
}
interface DeleteBody {
  clientId: string;
  action: "delete";
  fileId: string;
}
interface VisibilityBody {
  clientId: string;
  action: "visibility";
  fileId: string;
  customerVisible: boolean;
}
interface CollectionBody {
  clientId: string;
  action: "collection";
  fileId: string;
  collectionId?: string;
}
type Body = AddBody | DeleteBody | VisibilityBody | CollectionBody;

function makeId(): string {
  // Cryptographic randomness preferred; falls back to a timestamp+rand
  // mix for environments where `crypto.randomUUID` is unavailable.
  const c = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return `f_${c.randomUUID()}`;
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeExternalUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  await ensureHydrated();
  const body = await req.json().catch(() => null) as Body | null;
  if (!body?.clientId || !body.action) {
    return NextResponse.json({ ok: false, error: "clientId + action required" }, { status: 400 });
  }
  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"], body.clientId);
  } catch (error) {
    return authErrorResponse(error);
  }
  const client = getClientForAgency(session.agencyId, body.clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

  const meta = (client.metadata ?? {}) as { files?: ClientFileRef[] };
  const files: ClientFileRef[] = Array.isArray(meta.files) ? [...meta.files] : [];

  // Keep the existing role/action ceilings below, then apply canonical element
  // policy to every governed collaborator. Entirely ungoverned client/customer
  // identities retain the helper's documented legacy migration behaviour.
  const target = "fileId" in body ? files.find(file => file.id === body.fileId) : undefined;
  const descriptor = body.action === "add" ? body.file : target;
  if (descriptor) {
    try {
      await requireCurrentClientWorkspaceElementAccess(
        body.clientId,
        clientFileWorkspaceElementKey(descriptor),
        "use",
      );
    } catch (error) {
      return authErrorResponse(error);
    }
  }

  if (body.action === "add") {
    if (!body.file?.name?.trim() || !body.file.url?.trim() || !CATEGORIES.includes(body.file.category)) {
      return NextResponse.json({ ok: false, error: "file.name + file.url + valid category required" }, { status: 400 });
    }
    const safeUrl = safeExternalUrl(body.file.url);
    if (!safeUrl) {
      return NextResponse.json({ ok: false, error: "file links must use http or https" }, { status: 400 });
    }
    const recordEntryId = body.file.recordEntryId?.trim().slice(0, 160) || undefined;
    if (recordEntryId && !cleanClientRecordEntries(client.metadata?.clientRecordEntries).some(entry => entry.id === recordEntryId)) {
      return NextResponse.json({ ok: false, error: "client record entry not found" }, { status: 404 });
    }
    const customerCategories: readonly FileCategory[] = ["brief", "recording", "inspiration", "design-feedback", "payment-proof", "misc"];
    if (session.role === "end-customer" && !customerCategories.includes(body.file.category)) {
      return NextResponse.json({ ok: false, error: "customers cannot add this file type" }, { status: 403 });
    }
    const ref: ClientFileRef = {
      id: makeId(),
      name: body.file.name.trim(),
      url: safeUrl,
      category: body.file.category,
      uploadedBy: body.file.uploadedBy?.trim() || session.email,
      uploadedAt: Date.now(),
      productId: body.file.productId?.trim().slice(0, 120) || undefined,
      workspacePageId: body.file.workspacePageId?.trim().slice(0, 120) || undefined,
      collectionId: body.file.collectionId?.trim().slice(0, 120) || undefined,
      recordEntryId,
      customerVisible: session.role === "end-customer"
        || body.file.customerVisible === true
        || (body.file.customerVisible === undefined && body.file.category === "recording"),
    };
    files.unshift(ref);
    const updated = updateClient(session.agencyId, body.clientId, { metadata: { files } });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
    const ledgerEvent = upsertClientFileLedgerEvent(session.agencyId, body.clientId, ref);
    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "files",
      action: "client_file.link_added",
      message: `${session.email} shared “${ref.name}”.`,
      metadata: { fileId: ref.id, category: ref.category, productId: ref.productId, collectionId: ref.collectionId, recordEntryId: ref.recordEntryId },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, file: ref, ledgerEvent, files });
  }

  if (body.action === "delete") {
    if (!body.fileId) return NextResponse.json({ ok: false, error: "fileId required" }, { status: 400 });
    // A file can appear after the request's first snapshot. Authorise the exact
    // current descriptor before acting on it; otherwise a just-added commercial
    // or fulfilment file could bypass its narrower element gate.
    const accessClient = getClientForAgency(session.agencyId, body.clientId);
    const accessFiles = Array.isArray(accessClient?.metadata?.files)
      ? accessClient.metadata.files as ClientFileRef[]
      : [];
    const accessTarget = accessFiles.find(file => file.id === body.fileId);
    if (!accessTarget) return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
    try {
      await requireCurrentClientWorkspaceElementAccess(
        body.clientId,
        clientFileWorkspaceElementKey(accessTarget),
        "use",
      );
    } catch (error) {
      return authErrorResponse(error);
    }
    // The element-access check above awaited policy resolution. Re-read now so
    // an upload or file update that landed during that wait is never replaced
    // by the older `files` snapshot captured at the start of the request.
    const currentClient = getClientForAgency(session.agencyId, body.clientId);
    if (!currentClient) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
    const currentFiles = Array.isArray(currentClient.metadata?.files)
      ? [...currentClient.metadata.files] as ClientFileRef[]
      : [];
    const target = currentFiles.find(file => file.id === body.fileId);
    if (session.role === "end-customer" && target?.uploadedBy !== session.email) {
      return NextResponse.json({ ok: false, error: "customers can only remove their own files" }, { status: 403 });
    }
    if (!target) return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
    // Persist intent BEFORE touching storage. If that write is refused the
    // binary remains intact; if the request dies after the provider delete, a
    // reload still exposes a `deleting` record whose retry can converge rather
    // than an ordinary-looking link to a vanished object.
    const deleting = beginClientFileDeletion(currentFiles, body.fileId);
    const marked = updateClient(session.agencyId, body.clientId, { metadata: { files: deleting } });
    if (!marked) return NextResponse.json({ ok: false, error: "file deletion could not be started" }, { status: 500 });
    await flushPendingWrites();

    const removal = await deletePrivateUpload({
      storageProvider: target?.storageProvider,
      storageKey: target?.storageKey,
      localDirectory: "client-uploads",
    });
    if (!removal.ok) {
      // Provider I/O yielded to every other request. Merge the failure marker
      // into the latest collection instead of restoring the pre-provider array
      // and erasing a concurrent upload, visibility change or collection edit.
      const latestClient = getClientForAgency(session.agencyId, body.clientId);
      if (!latestClient) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
      const latestFiles = Array.isArray(latestClient.metadata?.files)
        ? [...latestClient.metadata.files] as ClientFileRef[]
        : [];
      const retained = failClientFileDeletion(latestFiles, body.fileId, removal.error);
      if (!updateClient(session.agencyId, body.clientId, { metadata: { files: retained } })) {
        return NextResponse.json({
          ok: false,
          code: "storage_delete_failed",
          error: "The stored file could not be removed and its retry state could not be saved.",
          detail: removal.error,
          storageKey: target.storageKey,
        }, { status: 500 });
      }
      logActivity({
        agencyId: session.agencyId,
        clientId: client.id,
        actorUserId: session.userId,
        actorEmail: session.email,
        category: "files",
        action: "client_file.remove_failed",
        message: `“${target?.name ?? "A project file"}” could not be removed from storage, so it is still stored.`,
        metadata: { fileId: body.fileId, category: target?.category, error: removal.error },
      });
      await flushPendingWrites();
      return NextResponse.json({
        ok: false,
        code: "storage_delete_failed",
        error: `“${target?.name ?? "This file"}” is still stored — the storage provider refused to remove it, so it has been kept here to retry rather than hidden.`,
        detail: removal.error,
        files: retained,
      }, { status: 502 });
    }
    // Only now remove the owning record. The response is not successful until
    // this mutation and its ledger/activity companions are durably flushed.
    const latestClient = getClientForAgency(session.agencyId, body.clientId);
    if (!latestClient) {
      return NextResponse.json({ ok: false, error: "The binary was removed, but the client record could not be reloaded for cleanup." }, { status: 500 });
    }
    const latestFiles = Array.isArray(latestClient.metadata?.files)
      ? [...latestClient.metadata.files] as ClientFileRef[]
      : [];
    const next = finishClientFileDeletion(latestFiles, body.fileId);
    const updated = updateClient(session.agencyId, body.clientId, { metadata: { files: next } });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
    removeClientRecordLedgerEvent(session.agencyId, body.clientId, "file", body.fileId);
    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "files",
      action: "client_file.removed",
      message: `${session.email} removed “${target?.name ?? "a project file"}”.`,
      metadata: { fileId: body.fileId, category: target?.category },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, files: next });
  }

  if (body.action === "visibility") {
    if (!AGENCY_ROLES.includes(session.role as (typeof AGENCY_ROLES)[number])) {
      return NextResponse.json({ ok: false, error: "only agency staff can change client visibility" }, { status: 403 });
    }
    const target = files.find(file => file.id === body.fileId);
    if (!target) return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
    const changed = { ...target, customerVisible: body.customerVisible === true };
    const next = files.map(file => file.id === changed.id ? changed : file);
    const updated = updateClient(session.agencyId, body.clientId, { metadata: { files: next } });
    if (!updated) return NextResponse.json({ ok: false, error: "visibility could not be saved" }, { status: 500 });
    const ledgerEvent = upsertClientFileLedgerEvent(session.agencyId, body.clientId, changed);
    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "files",
      action: changed.customerVisible ? "client_file.shared" : "client_file.made_private",
      message: `${changed.customerVisible ? "Shared" : "Made private"} “${changed.name}”.`,
      metadata: { fileId: changed.id, category: changed.category, customerVisible: changed.customerVisible },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, file: changed, ledgerEvent, files: next });
  }

  if (body.action === "collection") {
    if (!AGENCY_ROLES.includes(session.role as (typeof AGENCY_ROLES)[number])) {
      return NextResponse.json({ ok: false, error: "only agency staff can organise commercial evidence" }, { status: 403 });
    }
    const target = files.find(file => file.id === body.fileId);
    if (!target) return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
    if (target.category !== "payment-plan" && target.category !== "payment-proof") {
      return NextResponse.json({ ok: false, error: "only commercial evidence can be attached to a payment plan" }, { status: 409 });
    }
    const collectionId = body.collectionId?.trim().slice(0, 120) || undefined;
    if (collectionId && !cleanClientPaymentPlans(client.metadata?.clientPaymentPlans).some(plan => plan.id === collectionId)) {
      return NextResponse.json({ ok: false, error: "payment plan not found" }, { status: 404 });
    }
    const changed = { ...target, collectionId };
    const next = files.map(file => file.id === changed.id ? changed : file);
    const updated = updateClient(session.agencyId, body.clientId, { metadata: { files: next } });
    if (!updated) return NextResponse.json({ ok: false, error: "document could not be reorganised" }, { status: 500 });
    const ledgerEvent = upsertClientFileLedgerEvent(session.agencyId, body.clientId, changed);
    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "files",
      action: collectionId ? "client_file.attached" : "client_file.detached",
      message: `${collectionId ? "Attached" : "Moved"} “${changed.name}” ${collectionId ? "to a payment plan" : "to the general commercial record"}.`,
      metadata: { fileId: changed.id, category: changed.category, collectionId },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, file: changed, ledgerEvent, files: next });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
