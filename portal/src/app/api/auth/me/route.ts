import { NextResponse } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { getCurrentUser } from "@/lib/server/auth";

export async function GET() {
  await ensureHydrated();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    ok: true,
    user: {
      id: user.id, email: user.email, name: user.name,
      role: user.role, agencyId: user.agencyId, clientId: user.clientId,
      mustChangePassword: user.mustChangePassword === true,
    },
  });
}
