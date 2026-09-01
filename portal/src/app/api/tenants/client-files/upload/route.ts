import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth/auth";
import { attachStoredPrivateUpload, PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import type { ClientFileRef, FileCategory } from "../route";
import { upsertClientFileLedgerEvent } from "@/lib/server/clients/clientRecordLedger";
import { clientFileWorkspaceElementKey, requireCurrentClientWorkspaceElementAccess } from "@/lib/server/access/clientWorkspaceElementAccess";
import { resolveWorkspaceUploadReplay } from "@/lib/portal/productWorkspaceUploadBatch";
import {
  reconcileClientFileUpload,
  rollbackClientFileUpload,
  type ClientFileUploadDecision,
} from "@/lib/clients/clientFileUploadTransaction";
import { withClientMetadataLedgerTransaction } from "@/server/productWorkspaceCoordinator";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const CATEGORIES: readonly FileCategory[] = ["brand", "brief", "recording", "inspiration", "design-feedback", "preview", "deliverable", "invoice", "contract", "payment-plan", "payment-proof", "proposal", "legal", "misc"];
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "text/csv",
  "text/plain",
  "video/mp4",
  "video/quicktime",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "application/zip",
  "application/x-zip-compressed",
]);

function safeName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 120) || "file";
}

function makeId(): string {
  return `f_${crypto.randomBytes(8).toString("hex")}`;
}

async function sha256(file: File): Promise<string> {
  const hash = crypto.createHash("sha256");
  const reader = file.stream().getReader();
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    hash.update(chunk.value);
  }
  return hash.digest("hex");
}

export async function POST(req: Request) {
  await ensureHydrated();
  const form = await req.formData().catch(() => null);
  const clientId = typeof form?.get("clientId") === "string" ? String(form.get("clientId")).trim().slice(0, 120) : "";
  const category = typeof form?.get("category") === "string" ? String(form.get("category")) as FileCategory : "misc";
  const productId = typeof form?.get("productId") === "string" ? String(form.get("productId")).trim().slice(0, 120) : "";
  const workspacePageId = typeof form?.get("workspacePageId") === "string" ? String(form.get("workspacePageId")).trim().slice(0, 120) : "";
  const collectionId = typeof form?.get("collectionId") === "string" ? String(form.get("collectionId")).trim().slice(0, 120) : "";
  const suppliedUploadKey = typeof form?.get("uploadKey") === "string"
    ? String(form.get("uploadKey")).replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 240)
    : "";
  // Idempotency is deliberately restricted to the mounted workspace flow,
  // where all three scope identifiers are present. Generic file-room uploads
  // remain independent even when a caller happens to repeat a file name.
  const uploadKey = productId && workspacePageId && collectionId ? suppliedUploadKey : "";
  const recordEntryId = typeof form?.get("recordEntryId") === "string" ? String(form.get("recordEntryId")).trim().slice(0, 160) : "";
  const customerVisible = form?.get("customerVisible") === "true";
  const file = form?.get("file");
  if (!clientId || !(file instanceof File) || !CATEGORIES.includes(category)) {
    return NextResponse.json({ ok: false, error: "client, file and category are required" }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ ok: false, error: "files must be smaller than 50 MB" }, { status: 413 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ ok: false, error: "this file type is not supported" }, { status: 415 });
  }

  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"], clientId);
  } catch (error) {
    return authErrorResponse(error);
  }
  // Tenancy first, then permission (404, not 403) — see api/tenants/close-deal/route.ts.
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  try {
    await requireCurrentClientWorkspaceElementAccess(clientId, clientFileWorkspaceElementKey({
      category,
      productId,
      workspacePageId,
      recordEntryId,
    }), "use");
  } catch (error) {
    return authErrorResponse(error);
  }
  const customerCategories: readonly FileCategory[] = ["brief", "recording", "inspiration", "design-feedback", "payment-proof", "misc"];
  if (session.role === "end-customer" && !customerCategories.includes(category)) {
    return NextResponse.json({ ok: false, error: "customers cannot add this file type" }, { status: 403 });
  }
  if (recordEntryId) {
    const recordEntries = Array.isArray(client.metadata?.clientRecordEntries) ? client.metadata.clientRecordEntries : [];
    if (!recordEntries.some(entry => entry && typeof entry === "object" && "id" in entry && entry.id === recordEntryId)) {
      return NextResponse.json({ ok: false, error: "client record entry not found" }, { status: 404 });
    }
  }

  const meta = (client.metadata ?? {}) as { files?: ClientFileRef[] };
  const files = Array.isArray(meta.files) ? [...meta.files] : [];
  // The browser's name/size/mtime key is only a lookup hint. Bind an actual
  // replay to the bytes observed by this server so a same-metadata file cannot
  // be substituted accidentally or maliciously.
  const contentSha256 = uploadKey ? await sha256(file) : undefined;
  const replayInput = {
    name: file.name.trim().slice(0, 180),
    size: file.size,
    contentType: file.type,
    contentSha256,
    productId: productId || undefined,
    workspacePageId: workspacePageId || undefined,
    collectionId: collectionId || undefined,
    uploadKey: uploadKey || undefined,
  };
  const replay = resolveWorkspaceUploadReplay(files, replayInput);
  if (replay.status === "conflict") {
    return NextResponse.json({
      ok: false,
      code: "upload_key_conflict",
      error: "This retry key already belongs to a different file. Choose the files again to start a new upload.",
    }, { status: 409 });
  }
  if (replay.status === "replay") {
    return NextResponse.json({ ok: true, file: replay.file, files, replayed: true });
  }

  const id = makeId();
  const filename = safeName(file.name);
  const pathname = `clients/${session.agencyId}/${clientId}/${id}-${filename}`;
  const relativeKey = join(session.agencyId, clientId, `${id}-${filename}`);
  let stored;
  try {
    stored = await storePrivateUpload({
      pathname,
      file,
      contentType: file.type,
      localDirectory: "client-uploads",
      localKey: relativeKey,
    });
  } catch (error) {
    if (error instanceof PrivateUploadStorageError) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 503 });
    }
    throw error;
  }

  const ref: ClientFileRef = {
    id,
    name: file.name.trim().slice(0, 180),
    url: `/api/tenants/client-files/content?clientId=${encodeURIComponent(clientId)}&fileId=${encodeURIComponent(id)}`,
    category,
    uploadedBy: session.email,
    uploadedAt: Date.now(),
    size: file.size,
    contentType: file.type,
    contentSha256,
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    productId: productId || undefined,
    workspacePageId: workspacePageId || undefined,
    collectionId: collectionId || undefined,
    uploadKey: uploadKey || undefined,
    workspaceAttachmentState: collectionId ? "pending" : undefined,
    recordEntryId: recordEntryId || undefined,
    customerVisible: session.role === "end-customer" || customerVisible || (form?.get("customerVisible") === null && category === "recording"),
  };
  type LosingDecision = Extract<ClientFileUploadDecision<ClientFileRef>, { status: "replay" | "conflict" }>;
  const losingDecision: { current: LosingDecision | null } = { current: null };
  // Correctness lives AFTER provider I/O, inside a fresh per-client lock. The
  // request-start replay check above only avoids an unnecessary upload; it may
  // be stale by the time `storePrivateUpload` returns.
  const attached = await attachStoredPrivateUpload(
    stored,
    "client-uploads",
    () => withClientMetadataLedgerTransaction({
      agencyId: session.agencyId,
      clientId,
      ledger: "files",
    }, () => {
      const latestClient = getClientForAgency(session.agencyId, clientId);
      if (!latestClient) throw new Error("client could not be reloaded after binary storage");
      const latestFiles = Array.isArray(latestClient.metadata?.files)
        ? [...latestClient.metadata.files] as ClientFileRef[]
        : [];
      const decision = reconcileClientFileUpload(latestFiles, ref, replayInput);
      if (decision.status !== "attach") {
        losingDecision.current = decision;
        // The helper compensates ONLY this request's uniquely-keyed binary.
        // The winning durable row and its object are never passed to delete.
        throw new Error(`workspace_upload_${decision.status}`);
      }
      const result = updateClient(session.agencyId, clientId, { metadata: { files: decision.files } });
      if (!result) throw new Error("file record could not be saved");
      return { client: result, files: decision.files };
    }),
    {
      // A losing replay/conflict never inserted this id. A failed winner is
      // rolled back in ANOTHER fresh lock by subtracting only its immutable id;
      // no stale request-start array is ever restored.
      rollbackOwner: async () => {
        if (losingDecision.current) return;
        await withClientMetadataLedgerTransaction({
          agencyId: session.agencyId,
          clientId,
          ledger: "files",
        }, () => {
          const latestClient = getClientForAgency(session.agencyId, clientId);
          if (!latestClient) throw new Error("file record could not be reloaded for rollback");
          const latestFiles = Array.isArray(latestClient.metadata?.files)
            ? [...latestClient.metadata.files] as ClientFileRef[]
            : [];
          const rolledBack = rollbackClientFileUpload(latestFiles, ref.id);
          if (!updateClient(session.agencyId, clientId, { metadata: { files: rolledBack } })) {
            throw new Error("file record rollback failed");
          }
        });
      },
    },
  );
  if (!attached.ok) {
    const lost = losingDecision.current;
    if (lost && attached.compensated) {
      if (lost.status === "replay") {
        return NextResponse.json({ ok: true, file: lost.file, files: lost.files, replayed: true });
      }
      return NextResponse.json({
        ok: false,
        code: "upload_key_conflict",
        error: "This retry key already belongs to a different file. Choose the files again to start a new upload.",
      }, { status: 409 });
    }
    return NextResponse.json({
      ok: false,
      error: attached.message,
      code: attached.compensated ? "upload_record_failed" : "upload_orphaned",
      detail: attached.detail,
      storageKey: attached.compensated ? undefined : attached.storageKey,
    }, { status: 500 });
  }
  const committedFiles = attached.value.files;
  const ledgerEvent = upsertClientFileLedgerEvent(session.agencyId, clientId, ref);

  logActivity({
    agencyId: session.agencyId,
    clientId,
    actorUserId: session.userId,
    actorEmail: session.email,
    category: "files",
    action: "client_file.uploaded",
    message: `${session.email} uploaded “${ref.name}”.`,
    metadata: { fileId: ref.id, category, size: ref.size, productId: ref.productId, collectionId: ref.collectionId, recordEntryId: ref.recordEntryId },
  });

  await flushPendingWrites();

  return NextResponse.json({ ok: true, file: ref, ledgerEvent, files: committedFiles });
}
