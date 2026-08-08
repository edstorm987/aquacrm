import { NextResponse } from "next/server";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";
import { logActivity } from "@/server/activity";
import { unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { del } from "@vercel/blob";
import { deleteSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";

export const runtime = "nodejs";

export type FileCategory = "brand" | "brief" | "recording" | "inspiration" | "design-feedback" | "preview" | "deliverable" | "invoice" | "contract" | "misc";
const CATEGORIES: readonly FileCategory[] = ["brand", "brief", "recording", "inspiration", "design-feedback", "preview", "deliverable", "invoice", "contract", "misc"];

export interface ClientFileRef {
  id: string;
  name: string;
  url: string;
  category: FileCategory;
  uploadedBy?: string;
  uploadedAt: number;
  size?: number;
  contentType?: string;
  storageProvider?: "supabase" | "vercel-blob" | "local";
  storageKey?: string;
}

interface AddBody {
  clientId: string;
  action: "add";
  file: { name: string; url: string; category: FileCategory; uploadedBy?: string };
}
interface DeleteBody {
  clientId: string;
  action: "delete";
  fileId: string;
}
type Body = AddBody | DeleteBody;

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

  if (body.action === "add") {
    if (!body.file?.name?.trim() || !body.file.url?.trim() || !CATEGORIES.includes(body.file.category)) {
      return NextResponse.json({ ok: false, error: "file.name + file.url + valid category required" }, { status: 400 });
    }
    const safeUrl = safeExternalUrl(body.file.url);
    if (!safeUrl) {
      return NextResponse.json({ ok: false, error: "file links must use http or https" }, { status: 400 });
    }
    const customerCategories: readonly FileCategory[] = ["brief", "recording", "inspiration", "design-feedback", "misc"];
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
    };
    files.unshift(ref);
    const updated = updateClient(session.agencyId, body.clientId, { metadata: { files } });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
    logActivity({
      agencyId: session.agencyId,
      clientId: client.id,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "files",
      action: "client_file.link_added",
      message: `${session.email} shared “${ref.name}”.`,
      metadata: { fileId: ref.id, category: ref.category },
    });
    await flushPendingWrites();
    return NextResponse.json({ ok: true, file: ref, files });
  }

  if (body.action === "delete") {
    if (!body.fileId) return NextResponse.json({ ok: false, error: "fileId required" }, { status: 400 });
    const target = files.find(file => file.id === body.fileId);
    if (session.role === "end-customer" && target?.uploadedBy !== session.email) {
      return NextResponse.json({ ok: false, error: "customers can only remove their own files" }, { status: 403 });
    }
    const before = files.length;
    const next = files.filter(f => f.id !== body.fileId);
    if (next.length === before) return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
    if (target?.storageProvider === "supabase" && target.storageKey) {
      await deleteSupabasePrivateUpload(target.storageKey).catch(() => false);
    }
    if (target?.storageProvider === "vercel-blob" && target.storageKey) {
      await del(target.storageKey).catch(() => undefined);
    }
    if (target?.storageProvider === "local" && target.storageKey) {
      const uploadRoot = resolve(process.cwd(), ".data", "client-uploads");
      const targetPath = resolve(uploadRoot, target.storageKey);
      if (targetPath.startsWith(`${uploadRoot}/`)) {
        await unlink(targetPath).catch(() => undefined);
      }
    }
    const updated = updateClient(session.agencyId, body.clientId, { metadata: { files: next } });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
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

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
