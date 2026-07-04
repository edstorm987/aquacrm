// T1 R036 — Profile picture upload + clear endpoint.
//
//   POST   /api/auth/profile/avatar  { dataUrl }  → saves on the user record.
//   DELETE /api/auth/profile/avatar              → clears it (falls back to initials).
//
// The client (account page upload zone) resizes to 256×256 via <canvas>
// before posting; this route only validates mime allow-list + cap size.
// Cap matches `AVATAR_MAX_DATA_URL_BYTES` (~50KB encoded) so the inline
// store on the user record stays cheap.

import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { requireSession } from "@/lib/server/auth";
import { updateUser, getUserById } from "@/server/users";
import { validateAvatarDataUrl } from "@/lib/avatarDataUrl";

export async function POST(req: Request) {
  await ensureHydrated();
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { dataUrl?: unknown };
  const v = validateAvatarDataUrl(body.dataUrl);
  if (!v.ok) {
    const status = v.error === "too_large" ? 413 : 400;
    return NextResponse.json({ ok: false, error: v.error }, { status });
  }

  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const saved = updateUser(
    user.email,
    { avatarUrl: v.dataUrl },
    { clientId: user.clientId, role: user.role },
  );
  if (!saved) {
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, avatarUrl: saved.avatarUrl });
}

export async function DELETE() {
  await ensureHydrated();
  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  }
  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }
  updateUser(
    user.email,
    { avatarUrl: null },
    { clientId: user.clientId, role: user.role },
  );
  return NextResponse.json({ ok: true });
}
