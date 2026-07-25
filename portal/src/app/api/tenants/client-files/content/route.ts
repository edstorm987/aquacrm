import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { authErrorResponse, requireRoleForClient } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES, CLIENT_ROLES } from "@/server/types";
import { getClientForAgency } from "@/server/tenants";
import type { ClientFileRef } from "../route";

export const runtime = "nodejs";

function downloadHeaders(file: ClientFileRef): Headers {
  const headers = new Headers();
  headers.set("content-type", file.contentType || "application/octet-stream");
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  headers.set("cache-control", "private, max-age=60");
  headers.set("x-content-type-options", "nosniff");
  if (file.size) headers.set("content-length", String(file.size));
  return headers;
}

export async function GET(req: Request) {
  await ensureHydrated();
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId")?.trim().slice(0, 120) ?? "";
  const fileId = url.searchParams.get("fileId")?.trim().slice(0, 120) ?? "";
  if (!clientId || !fileId) {
    return NextResponse.json({ ok: false, error: "clientId + fileId required" }, { status: 400 });
  }

  let session;
  try {
    session = await requireRoleForClient([...AGENCY_ROLES, ...CLIENT_ROLES, "end-customer"], clientId);
  } catch (error) {
    return authErrorResponse(error);
  }
  const client = getClientForAgency(session.agencyId, clientId);
  if (!client) return NextResponse.json({ ok: false, error: "client not found" }, { status: 404 });
  const files = Array.isArray(client.metadata?.files) ? client.metadata.files as ClientFileRef[] : [];
  const file = files.find(item => item.id === fileId);
  if (!file?.storageProvider || !file.storageKey) {
    return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
  }

  if (file.storageProvider === "vercel-blob") {
    const result = await get(file.storageKey, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }
    return new Response(result.stream, { status: 200, headers: downloadHeaders(file) });
  }

  try {
    const uploadRoot = resolve(process.cwd(), ".data", "client-uploads");
    const targetPath = resolve(uploadRoot, file.storageKey);
    if (!targetPath.startsWith(`${uploadRoot}/`)) {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }
    const bytes = await readFile(targetPath);
    return new Response(bytes, { status: 200, headers: downloadHeaders(file) });
  } catch {
    return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
  }
}
