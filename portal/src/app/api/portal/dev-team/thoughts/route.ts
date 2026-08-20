import { NextResponse, type NextRequest } from "next/server";

import { requireRole } from "@/lib/server/auth/auth";
import { devDocsAccessible } from "@/lib/server/dev/devDocs";
import { addThought, listThoughts } from "@/lib/server/dev/devTeamThoughts";
import { ensureHydrated } from "@/server/storage";
import { getUser } from "@/server/users";
import { AGENCY_ROLES } from "@/server/types";

// Leave a thought on a task/plan so a worker can pick it up. Founder + Dev Mode
// only, same gate as the rest of the console.
export const dynamic = "force-dynamic";

async function gate() {
  await ensureHydrated();
  const session = await requireRole([...AGENCY_ROLES]);
  return devDocsAccessible(session) ? session : null;
}

export async function GET() {
  try {
    const session = await gate();
    if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, thoughts: await listThoughts() }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await gate();
    if (!session) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

    const body = await request.json().catch(() => null) as {
      text?: string; taskId?: string; planName?: string; worker?: string;
    } | null;
    if (!body?.text) return NextResponse.json({ ok: false, error: "Say something first." }, { status: 400 });

    const account = getUser(session.email);
    const thought = await addThought({
      text: String(body.text),
      author: account?.name || session.email,
      taskId: typeof body.taskId === "string" ? body.taskId : undefined,
      planName: typeof body.planName === "string" ? body.planName : undefined,
      worker: typeof body.worker === "string" ? body.worker : undefined,
    });

    return NextResponse.json({ ok: true, thought }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save that.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
