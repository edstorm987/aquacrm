import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "@vercel/blob";
import { NextResponse, type NextRequest } from "next/server";

import { getSessionFromRequest } from "@/lib/server/auth/auth";
import { readSupabasePrivateUpload } from "@/lib/server/privateUploadStorage";
import { getPeopleEmployeeByUserId } from "@/server/people";
import { ensureHydrated, getState } from "@/server/storage";

export const runtime = "nodejs";

function headers(name: string, type: string, size: number): Headers {
  return new Headers({
    "content-type": type || "application/octet-stream",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    "content-length": String(size),
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  });
}

export async function GET(request: NextRequest) {
  await ensureHydrated();
  const session = await getSessionFromRequest(request);
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const jobId = request.nextUrl.searchParams.get("jobId")?.trim().slice(0, 120) ?? "";
  const fileId = request.nextUrl.searchParams.get("fileId")?.trim().slice(0, 120) ?? "";
  const job = getState().peopleFreelancerJobs[jobId];
  if (!job || job.agencyId !== session.agencyId) return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
  if (session.role === "freelancer") {
    const employee = getPeopleEmployeeByUserId(session.agencyId, session.userId);
    if (!employee || employee.id !== job.employeeId) return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
  } else if (!session.role.startsWith("agency-")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const file = (job.submissions ?? []).find(item => item.id === fileId);
  if (!file) return NextResponse.json({ ok: false, error: "file not found" }, { status: 404 });
  const responseHeaders = headers(file.name, file.contentType, file.size);
  if (file.storageProvider === "supabase") {
    const blob = await readSupabasePrivateUpload(file.storageKey);
    return blob ? new Response(blob, { status: 200, headers: responseHeaders }) : NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
  }
  if (file.storageProvider === "vercel-blob") {
    const stored = await get(file.storageKey, { access: "private" });
    return stored?.statusCode === 200 && stored.stream
      ? new Response(stored.stream, { status: 200, headers: responseHeaders })
      : NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
  }
  try {
    const root = resolve(process.cwd(), ".data", "freelancer-work");
    const path = resolve(root, file.storageKey);
    if (!path.startsWith(`${root}/`)) throw new Error("invalid path");
    return new Response(await readFile(path), { status: 200, headers: responseHeaders });
  } catch {
    return NextResponse.json({ ok: false, error: "stored file not found" }, { status: 404 });
  }
}
