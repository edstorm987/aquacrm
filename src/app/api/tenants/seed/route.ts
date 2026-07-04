// Dev-only seed endpoint.
//
// POST /api/tenants/seed seeds a Milesy Media agency + owner + Felicia
// client + a sample client-owner user, when the store is empty. Useful
// for `npm run dev` smoke tests. Returns 403 in production unless the
// caller already has a session.

import { NextResponse, type NextRequest } from "next/server";
import { ensureHydrated } from "@/server/storage";
import { createAgency, createClient, listAgencies } from "@/server/tenants";
import { createUser, listUsersForAgency } from "@/server/users";
import { getSession } from "@/lib/server/auth";
import { logActivity } from "@/server/activity";

export async function POST(req: NextRequest) {
  await ensureHydrated();

  if (process.env.NODE_ENV === "production") {
    const s = await getSession();
    if (!s) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const ownerEmail = url.searchParams.get("ownerEmail") ?? "ed@milesymedia.com";
  const ownerPassword = url.searchParams.get("ownerPassword") ?? "milesy-dev-2026";
  const clientOwnerEmail = url.searchParams.get("clientEmail") ?? "felicia@luvandker.com";
  const clientOwnerPassword = url.searchParams.get("clientPassword") ?? "felicia-dev-2026";

  const existing = listAgencies();
  if (existing.length > 0) {
    return NextResponse.json({ ok: false, error: "Already seeded.", agencies: existing.map(a => a.id) }, { status: 409 });
  }

  const agency = createAgency({
    name: "Milesy Media",
    slug: "milesy-media",
    ownerEmail,
    brand: { primaryColor: "#0EA5A4", accentColor: "#F97316", fontHeading: "ui-sans-serif, system-ui" },
  });
  const owner = createUser({
    email: ownerEmail, password: ownerPassword,
    name: "Ed Hallam", role: "agency-owner", agencyId: agency.id,
  });

  const felicia = createClient(agency.id, {
    name: "Luv & Ker",
    slug: "luv-and-ker",
    ownerEmail: clientOwnerEmail,
    websiteUrl: "https://luvandker.com",
    stage: "live",
    brand: { primaryColor: "#7C3AED", accentColor: "#FACC15", fontHeading: "ui-serif, Georgia" },
  });
  const clientOwner = createUser({
    email: clientOwnerEmail, password: clientOwnerPassword,
    name: "Felicia", role: "client-owner", agencyId: agency.id, clientId: felicia.id,
  });

  logActivity({
    agencyId: agency.id, actorUserId: owner.id, actorEmail: ownerEmail,
    category: "system", action: "seed", message: "Seeded Milesy Media + Felicia (Luv & Ker).",
  });

  const _staffCount = listUsersForAgency(agency.id).length;
  return NextResponse.json({
    ok: true,
    agency: { id: agency.id, name: agency.name },
    client: { id: felicia.id, name: felicia.name },
    users: [
      { email: owner.email, role: owner.role, password: ownerPassword },
      { email: clientOwner.email, role: clientOwner.role, password: clientOwnerPassword },
    ],
  });
}
