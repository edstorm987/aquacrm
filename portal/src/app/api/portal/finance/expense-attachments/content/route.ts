import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

import { AuthError, authErrorResponse, getSessionFromRequest } from "@/lib/server/auth";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

export const runtime = "nodejs";

function responseHeaders(name: string, contentType: string, size: string | null): Headers {
  const headers = new Headers();
  headers.set("content-type", contentType || "application/octet-stream");
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(name || "expense-file")}`);
  headers.set("cache-control", "private, max-age=60");
  headers.set("x-content-type-options", "nosniff");
  if (size && /^\d+$/.test(size)) headers.set("content-length", size);
  return headers;
}

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || !AGENCY_ROLES.includes(session.role)) throw new AuthError(401, "unauthorized");
    const params = new URL(request.url).searchParams;
    const provider = params.get("provider");
    const storageKey = params.get("key") ?? "";
    const name = params.get("name") ?? "expense-file";
    const headers = responseHeaders(name, params.get("type") ?? "", params.get("size"));

    if (provider === "vercel-blob") {
      let pathname = "";
      try {
        pathname = new URL(storageKey).pathname;
      } catch {
        return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
      }
      if (!pathname.includes(`/expenses/${session.agencyId}/`)) {
        return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
      }
      const result = await get(storageKey, { access: "private" });
      if (!result || result.statusCode !== 200 || !result.stream) {
        return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
      }
      return new Response(result.stream, { status: 200, headers });
    }

    if (provider !== "local") {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }
    const uploadRoot = resolve(process.cwd(), ".data", "expense-uploads");
    const targetPath = resolve(uploadRoot, storageKey);
    const agencyRoot = resolve(uploadRoot, session.agencyId);
    if (!targetPath.startsWith(`${agencyRoot}/`)) {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }
    try {
      return new Response(await readFile(targetPath), { status: 200, headers });
    } catch {
      return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
