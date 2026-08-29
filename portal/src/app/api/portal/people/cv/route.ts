import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

import { authErrorResponse, getSessionFromRequest, AuthError } from "@/lib/server/auth/auth";
import { readSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { getPeopleApplication } from "@/server/people";
import { ensureHydrated } from "@/server/storage";
import { requireCurrentWorkspaceElementAccess } from "@/lib/server/access/workspaceElementAccess";

export const runtime = "nodejs";

function headers(file: { fileName: string; contentType: string; size: number }): Headers {
  const value = new Headers();
  value.set("content-type", file.contentType || "application/octet-stream");
  value.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  value.set("cache-control", "private, no-store");
  value.set("x-content-type-options", "nosniff");
  value.set("content-length", String(file.size));
  return value;
}

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session || (session.role !== "agency-owner" && session.role !== "agency-manager")) throw new AuthError(401, "unauthorized");
    // A candidate's CV is HR recruitment data. Every other application action in
    // the People route answers to `staff.people`; this one was still deciding on
    // the role alone, so a governed manager restricted out of People could read
    // applicants' CVs. It is a read, so `view` — the same level that shows the
    // application it belongs to.
    await requireCurrentWorkspaceElementAccess("staff", "staff.people", "view");
    const applicationId = request.nextUrl.searchParams.get("applicationId")?.trim() ?? "";
    const application = getPeopleApplication(session.agencyId, applicationId);
    if (!application) return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    const file = application.cv;
    if (file.storageProvider === "supabase") {
      const stored = await readSupabasePrivateUpload(file.storageKey);
      return stored ? new Response(stored, { headers: headers(file) }) : NextResponse.json({ ok: false, error: "CV file not found." }, { status: 404 });
    }
    if (file.storageProvider === "vercel-blob") {
      const result = await get(file.storageKey, { access: "private" });
      return result?.statusCode === 200 && result.stream
        ? new Response(result.stream, { headers: headers(file) })
        : NextResponse.json({ ok: false, error: "CV file not found." }, { status: 404 });
    }
    const root = resolve(process.cwd(), ".data", "people-cvs");
    const target = resolve(root, file.storageKey);
    if (!target.startsWith(`${root}/`)) return NextResponse.json({ ok: false, error: "CV file not found." }, { status: 404 });
    return new Response(await readFile(target), { headers: headers(file) });
  } catch (cause) {
    return authErrorResponse(cause);
  }
}
