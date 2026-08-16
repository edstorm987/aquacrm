import crypto from "node:crypto";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { PrivateUploadStorageError, storePrivateUpload } from "@/lib/server/privateUploadStorage";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import type { ClientFileRef, FileCategory } from "../route";
import { upsertClientFileLedgerEvent } from "@/lib/server/clientRecordLedger";

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

export async function POST(req: Request) {
  await ensureHydrated();
  const form = await req.formData().catch(() => null);
  const clientId = typeof form?.get("clientId") === "string" ? String(form.get("clientId")).trim().slice(0, 120) : "";
  const category = typeof form?.get("category") === "string" ? String(form.get("category")) as FileCategory : "misc";
  const productId = typeof form?.get("productId") === "string" ? String(form.get("productId")).trim().slice(0, 120) : "";
  const workspacePageId = typeof form?.get("workspacePageId") === "string" ? String(form.get("workspacePageId")).trim().slice(0, 120) : "";
  const collectionId = typeof form?.get("collectionId") === "string" ? String(form.get("collectionId")).trim().slice(0, 120) : "";
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
  const customerCategories: readonly FileCategory[] = ["brief", "recording", "inspiration", "design-feedback", "payment-proof", "misc"];
  if (session.role === "end-customer" && !customerCategories.includes(category)) {
    return NextResponse.json({ ok: false, error: "customers cannot add this file type" }, { status: 403 });
  }
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  if (recordEntryId) {
    const recordEntries = Array.isArray(client.metadata?.clientRecordEntries) ? client.metadata.clientRecordEntries : [];
    if (!recordEntries.some(entry => entry && typeof entry === "object" && "id" in entry && entry.id === recordEntryId)) {
      return NextResponse.json({ ok: false, error: "client record entry not found" }, { status: 404 });
    }
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

  const meta = (client.metadata ?? {}) as { files?: ClientFileRef[] };
  const files = Array.isArray(meta.files) ? [...meta.files] : [];
  const ref: ClientFileRef = {
    id,
    name: file.name.trim().slice(0, 180),
    url: `/api/tenants/client-files/content?clientId=${encodeURIComponent(clientId)}&fileId=${encodeURIComponent(id)}`,
    category,
    uploadedBy: session.email,
    uploadedAt: Date.now(),
    size: file.size,
    contentType: file.type,
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    productId: productId || undefined,
    workspacePageId: workspacePageId || undefined,
    collectionId: collectionId || undefined,
    recordEntryId: recordEntryId || undefined,
    customerVisible: session.role === "end-customer" || customerVisible || (form?.get("customerVisible") === null && category === "recording"),
  };
  files.unshift(ref);
  const updated = updateClient(session.agencyId, clientId, { metadata: { files } });
  if (!updated) return NextResponse.json({ ok: false, error: "file record could not be saved" }, { status: 500 });
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

  return NextResponse.json({ ok: true, file: ref, ledgerEvent, files });
}
