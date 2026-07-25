import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { getActiveAgencyId, requireRole } from "@/lib/server/auth";
import { createUser, getUser, listUsersForAgency } from "@/server/users";
import { logActivity } from "@/server/activity";
import type { Role, ServerUser } from "@/server/types";

const STAFF_ROLES: Role[] = ["agency-manager", "agency-staff"];

interface Body {
  name?: unknown;
  email?: unknown;
  username?: unknown;
  role?: unknown;
  password?: unknown;
}

function publicUser(user: ServerUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function GET() {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole(["agency-owner", "agency-manager"]);
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const agencyId = getActiveAgencyId(session);
  const users = listUsersForAgency(agencyId)
    .filter(user => user.role.startsWith("agency-"))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(publicUser);

  return NextResponse.json({ ok: true, users });
}

export async function POST(req: NextRequest) {
  await ensureHydrated();
  let session;
  try {
    session = await requireRole(["agency-owner", "agency-manager"]);
  } catch {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const username = typeof body.username === "string" ? body.username.trim() : undefined;
  const role = typeof body.role === "string" ? body.role as Role : "agency-staff";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name || name.length < 2) {
    return NextResponse.json({ ok: false, error: "Name must be at least 2 characters." }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
  }
  if (!STAFF_ROLES.includes(role)) {
    return NextResponse.json({ ok: false, error: "Choose a valid staff role." }, { status: 400 });
  }
  if (session.role !== "agency-owner" && role === "agency-manager") {
    return NextResponse.json({ ok: false, error: "Only the owner can create managers." }, { status: 403 });
  }
  if (getUser(email)) {
    return NextResponse.json({ ok: false, error: "A user with that email already exists." }, { status: 409 });
  }

  try {
    const agencyId = getActiveAgencyId(session);
    const user = createUser({
      name,
      email,
      username,
      password,
      role,
      agencyId,
    });

    logActivity({
      agencyId,
      actorUserId: session.userId,
      actorEmail: session.email,
      category: "settings",
      action: "team.user_created",
      message: `${session.email} created ${role} account ${user.email}.`,
      metadata: { userId: user.id, role },
    });

    return NextResponse.json({ ok: true, user: publicUser(user) }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not create user." },
      { status: 400 },
    );
  }
}
