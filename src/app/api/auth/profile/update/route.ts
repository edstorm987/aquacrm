import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { requireSession } from "@/lib/server/auth";
import { updateUser, getUserById } from "@/server/users";

export async function POST(req: Request) {
  await ensureHydrated();
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  let name: string | undefined;
  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { name?: unknown };
    if (typeof body.name === "string") name = body.name.trim();
  } else {
    const form = await req.formData();
    const v = form.get("name");
    if (typeof v === "string") name = v.trim();
  }

  if (name !== undefined) {
    const user = getUserById(session.userId);
    if (user) {
      updateUser(user.email, { name }, { clientId: user.clientId, role: user.role });
    }
  }

  // Browser POST → redirect back to the profile page so the form
  // shows the updated value.
  return NextResponse.redirect(new URL("/portal/account?saved=1", req.url), { status: 303 });
}
