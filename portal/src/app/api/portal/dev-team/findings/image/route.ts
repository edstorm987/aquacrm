import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/server/auth";
import { devDocsAccessible } from "@/lib/server/devDocs";
import { readFindingImage } from "@/lib/server/devTeamFindings";
import { ensureHydrated } from "@/server/storage";
import { AGENCY_ROLES } from "@/server/types";

// Serve a finding's screenshot behind the same founder + Dev Mode gate as the
// rest of the portal. The images live in `docs/development/findings/images/`,
// which Next does not serve — deliberately, so screenshots of real business
// data are never publicly reachable.
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    let session;
    try {
      session = await requireRole([...AGENCY_ROLES]);
    } catch {
      return new NextResponse(null, { status: 401 });
    }
    if (!devDocsAccessible(session)) return new NextResponse(null, { status: 404 });

    const name = request.nextUrl.searchParams.get("name") ?? "";
    const buffer = await readFindingImage(name);
    if (!buffer) return new NextResponse(null, { status: 404 });

    const ext = name.split(".").pop()?.toLowerCase() ?? "png";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
