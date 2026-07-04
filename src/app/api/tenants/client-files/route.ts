import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { requireRoleForClient } from "@/lib/server/auth";
import { AGENCY_ROLES } from "@/server/types";
import { getClientForAgency, updateClient } from "@/server/tenants";

// v0 file reference store. T2 R010's `@aqua/plugin-client-files` will
// supersede this once shipped (real upload + S3 + storage). For now we
// hold operator-pasted Drive / Dropbox / Notion links on the client's
// `metadata.files[]` array.

export type FileCategory = "brand" | "brief" | "deliverable" | "invoice" | "misc";
const CATEGORIES: readonly FileCategory[] = ["brand", "brief", "deliverable", "invoice", "misc"];

interface ClientFileRef {
  id: string;
  name: string;
  url: string;
  category: FileCategory;
  uploadedBy?: string;
  uploadedAt: number;
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

export async function POST(req: Request) {
  await ensureHydrated();
  const body = await req.json().catch(() => null) as Body | null;
  if (!body?.clientId || !body.action) {
    return NextResponse.json({ ok: false, error: "clientId + action required" }, { status: 400 });
  }
  const session = await requireRoleForClient([...AGENCY_ROLES], body.clientId);
  const client = getClientForAgency(session.agencyId, body.clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });

  const meta = (client.metadata ?? {}) as { files?: ClientFileRef[] };
  const files: ClientFileRef[] = Array.isArray(meta.files) ? [...meta.files] : [];

  if (body.action === "add") {
    if (!body.file?.name?.trim() || !body.file.url?.trim() || !CATEGORIES.includes(body.file.category)) {
      return NextResponse.json({ ok: false, error: "file.name + file.url + valid category required" }, { status: 400 });
    }
    const ref: ClientFileRef = {
      id: makeId(),
      name: body.file.name.trim(),
      url: body.file.url.trim(),
      category: body.file.category,
      uploadedBy: body.file.uploadedBy?.trim() || session.email,
      uploadedAt: Date.now(),
    };
    files.unshift(ref);
    const updated = updateClient(session.agencyId, body.clientId, { metadata: { files } });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
    return NextResponse.json({ ok: true, file: ref, files });
  }

  if (body.action === "delete") {
    if (!body.fileId) return NextResponse.json({ ok: false, error: "fileId required" }, { status: 400 });
    const before = files.length;
    const next = files.filter(f => f.id !== body.fileId);
    if (next.length === before) return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
    const updated = updateClient(session.agencyId, body.clientId, { metadata: { files: next } });
    if (!updated) return NextResponse.json({ ok: false, error: "update failed" }, { status: 500 });
    return NextResponse.json({ ok: true, files: next });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
