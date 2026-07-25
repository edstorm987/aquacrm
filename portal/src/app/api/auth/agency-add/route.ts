// POST /api/auth/agency-add — create a new agency + add the current
// user as a master member + flip the session's activeAgencyId to the
// new tenant. Backs the AgencySwitcher's "Add new agency" form (Ed's
// directive 2026-05-07 — agency-name title button + add tenants from
// the UI).
//
// Body: { name: string, slug?: string }
// Slug is auto-derived from name when omitted; clashes return 409.
// Idempotent on slug — re-submitting same name finds the existing
// agency, joins the user if not already a member, and switches.
//
// Founders only — agency creation is a master-side privilege.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import {
  getSessionFromRequest,
  issueSession,
  sessionCookie,
  getSessionAgencyIds,
} from "@/lib/server/auth";
import { resolvePostLoginPath } from "@/lib/server/postLoginRedirect";
import { getUserById } from "@/server/users";
import { bootstrapAgency } from "@/server/agencyBootstrap";
import { getAgencyBySlug } from "@/server/tenants";
import { addUserAgencyMembership } from "@/lib/server/aquaOasisSeed";
import { logActivity } from "@/server/activity";

interface Body {
  name?: unknown;
  slug?: unknown;
}

const SLUG_RE = /^[a-z][a-z0-9-]{1,40}$/;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "agency";
}

export async function POST(req: NextRequest) {
  await ensureHydrated();

  const session = await getSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // Only agency-owner / agency-manager can stand up new tenants.
  if (session.role !== "agency-owner" && session.role !== "agency-manager") {
    return NextResponse.json({ ok: false, error: "founder_only" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length < 2 || name.length > 80) {
    return NextResponse.json({ ok: false, error: "Name must be 2-80 chars." }, { status: 400 });
  }
  let slug = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim().toLowerCase() : slugify(name);
  if (!SLUG_RE.test(slug)) slug = slugify(slug);

  const user = getUserById(session.userId);
  if (!user) {
    return NextResponse.json({ ok: false, error: "user_missing" }, { status: 401 });
  }

  // Idempotent: existing slug → join + switch.
  let agency = getAgencyBySlug(slug);
  let createdAgency = false;
  if (!agency) {
    try {
      const result = await bootstrapAgency({
        name,
        slug,
        ownerEmail: user.email,
      });
      agency = result.agency;
      createdAgency = true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "bootstrap_failed";
      return NextResponse.json({ ok: false, error: msg }, { status: 409 });
    }
  }

  // Add membership + bump sessionRev so the new agency lights up in
  // the switcher immediately on next session refresh.
  addUserAgencyMembership(user.id, agency.id);

  const refreshed = getUserById(user.id) ?? user;
  const nextAgencyIds = Array.from(new Set([...getSessionAgencyIds(session), agency.id]));

  const token = issueSession({
    userId: refreshed.id,
    email: refreshed.email,
    role: refreshed.role,
    agencyId: agency.id,
    agencyIds: nextAgencyIds,
    activeAgencyId: agency.id,
    clientId: session.clientId,
    isDemo: session.isDemo,
    sessionRev: refreshed.sessionRev ?? 0,
  });
  const cookie = sessionCookie(token);

  logActivity({
    agencyId: agency.id,
    actorUserId: user.id,
    actorEmail: user.email,
    category: "auth",
    action: createdAgency ? "agency.created" : "agency.joined",
    message: createdAgency
      ? `Agency "${agency.name}" created via Topbar add-agency by ${user.email}.`
      : `${user.email} joined agency "${agency.name}" via Topbar add-agency.`,
  });

  const redirect = resolvePostLoginPath(null, refreshed) ?? "/portal/agency";

  const res = NextResponse.json({ ok: true, redirect, agencyId: agency.id, created: createdAgency });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
