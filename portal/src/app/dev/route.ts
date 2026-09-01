import { NextResponse } from "next/server";
import crypto from "crypto";

import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
import { localDevDestination } from "@/lib/server/dev/localDevDestination";
import {
  DEV_AGENCY_NAME,
  DEV_AGENCY_SLUG,
  DEV_OWNER_EMAIL,
  devModeStatus,
  devAgencySlug,
  usingDefaultDevAgency,
} from "@/lib/server/dev/devMode";
import { createAgency, getClientForAgency, listClients } from "@/server/tenants";
import { createUser, getUser, listUsersForAgency, listUsersForClient } from "@/server/users";
import { CUSTOMER_PORTAL_ROLES } from "@/server/types";
import {
  LIVE_DATA_REALM_ID,
  ensureHydrated,
  flushPendingWrites,
  getState,
  runInDataRealm,
} from "@/server/storage";

/**
 * Dev mode entry. Signs you into the `Bare Co` dev tenant with a fully
 * writable session so the real UI can be driven end to end without production
 * credentials and without touching production data.
 *
 * Unlike `/showcase`, this does NOT set `publicShowcase`, so `proxy.ts` does
 * not force the session read-only — mutations work, which is the whole point.
 *
 * Gated by four independent conditions in `devModeStatus()`. The strongest is
 * that the active storage backend must be file or memory, so dev mode cannot
 * mint a session against a durable backend even if the other guards were
 * misconfigured together.
 */
export async function GET(request: Request) {
  const status = devModeStatus();
  if (!status.enabled) {
    // Behave as if the route does not exist, but say why in the body — this
    // only ever renders locally, and a silent 404 while debugging is unkind.
    return NextResponse.json(
      { ok: false, error: "Dev mode is not available.", reason: status.reason },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  // `/dev` mints a normal (non-sandbox) local session. An existing browser
  // cookie may still select a sandbox resource realm, but that realm's user is
  // only a presentation/data copy and can carry older session/access epochs.
  // Anchor the entire lookup + mint to live local authority so the resulting
  // cookie is immediately valid at capability-gated APIs. This remains inside
  // devModeStatus()'s file/memory-only boundary and cannot reach production.
  return runInDataRealm(LIVE_DATA_REALM_ID, () => enterLocalDev(request));
}

async function enterLocalDev(request: Request) {
  await ensureHydrated({ preserveExplicitRealm: true });

  const slug = devAgencySlug();
  const existing = Object.values(getState().agencies)
    .find(entry => entry.slug === slug || entry.id === slug);

  // Only the default tenant is created on demand. A named one that is missing
  // is a typo or the wrong snapshot, and silently creating an empty tenant
  // under that name would look like the data had vanished.
  if (!existing && !usingDefaultDevAgency()) {
    return NextResponse.json({
      error: `No tenant "${slug}" in this sandbox.`,
      hint: "Check PORTAL_DEV_AGENCY, or unset it to use Bare Co.",
      available: Object.values(getState().agencies).map(entry => entry.slug ?? entry.id),
    }, { status: 404, headers: { "cache-control": "no-store" } });
  }

  const agency = existing ?? createAgency({ name: DEV_AGENCY_NAME, slug: DEV_AGENCY_SLUG });

  // Reuse the existing owner if the tenant has one; otherwise mint one with a
  // random password. The password is never needed or shown — dev mode issues
  // the session directly — and a random value means the account cannot be
  // signed into by guessing if this state ever leaked.
  const owner = listUsersForAgency(agency.id).find(user => user.role === "agency-owner")
    ?? getUser(DEV_OWNER_EMAIL, { agencyId: agency.id } as never)
    ?? createUser({
      email: DEV_OWNER_EMAIL,
      name: "Dev Owner",
      role: "agency-owner",
      agencyId: agency.id,
      password: `dev-${crypto.randomBytes(24).toString("hex")}`,
    });

  // Standing in for a client signing in.
  //
  // The connect flow needs a session scoped to the client the link names, and
  // there is otherwise no way to have one locally: `/api/auth/login` goes
  // through Supabase, so a sandbox-only user cannot sign in at all. Without
  // this the flow can be read but never walked.
  //
  // TEMPORARY, and safe only because of where it lives: every guard in
  // `devModeStatus()` has already passed above, including that the storage
  // backend is file or memory. Remove it alongside the confirmation-code
  // stand-in, once a real client user can sign in.
  const asClient = new URL(request.url).searchParams.get("client")?.trim();
  if (asClient) {
    const client = getClientForAgency(agency.id, asClient);
    if (!client) {
      return NextResponse.json({
        error: `No client "${asClient}" in ${agency.name}.`,
        available: listClients(agency.id).map(entry => ({ id: entry.id, name: entry.name })),
      }, { status: 404, headers: { "cache-control": "no-store" } });
    }

    // Prefer a REAL client user, whatever their role.
    //
    // This used to insist on `end-customer` because "the customer portal layout
    // requires that role", and noted that a `client-owner` following the same
    // link "lands somewhere else entirely — a real question, but not this
    // route's to answer". Phase 18 answered it on 2026-08-27: the portal serves
    // the whole client audience (`CUSTOMER_PORTAL_ROLES`) and `/portal` sends
    // client roles there, so both land in the same place now.
    //
    // So sign in as whoever the client actually has, newest first, and only
    // mint a throwaway `end-customer` when the client has nobody at all. That
    // makes the dev link walk the real thing rather than a role chosen to work
    // around a gate that no longer exists.
    const clientUser = listUsersForClient(client.id)
      .find(user => (CUSTOMER_PORTAL_ROLES as readonly string[]).includes(user.role))
      ?? createUser({
        email: `dev-customer-${client.id}@bare-co.test`,
        name: `${client.name} (dev)`,
        role: "end-customer",
        agencyId: agency.id,
        clientId: client.id,
        password: `dev-${crypto.randomBytes(24).toString("hex")}`,
      });

    await flushPendingWrites();

    const clientToken = issueSession({
      userId: clientUser.id,
      email: clientUser.email,
      role: clientUser.role,
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      clientId: client.id,
      isDemo: true,
      sessionRev: clientUser.sessionRev ?? 0,
    } as never);

    const clientTarget = new URL(request.url).searchParams.get("to");
    const clientDestination = localDevDestination(clientTarget, "/portal/customer", request.url);
    const clientResponse = NextResponse.redirect(new URL(clientDestination, request.url), 303);
    const cookie = sessionCookie(clientToken);
    clientResponse.cookies.set(cookie.name, cookie.value, cookie.options);
    clientResponse.headers.set("cache-control", "no-store");
    console.log(`[dev-mode] signed in as ${clientUser.email} on client ${client.name} (${client.id})`);
    return clientResponse;
  }

  // Local role acceptance needs a real non-owner session, not the Sandbox
  // switcher's owner-authority presentation modes. A named dev dataset may
  // already contain staff, managers or freelancers; `?as=` can select one of
  // those existing identities without creating a user or changing any grant.
  // The same four dev-mode guards above still apply, including the file/memory
  // backend boundary, so this can never mint a durable-production session.
  const persona = new URL(request.url).searchParams.get("as")?.trim().toLowerCase();
  const personaRoles = {
    owner: "agency-owner",
    manager: "agency-manager",
    staff: "agency-staff",
    freelancer: "freelancer",
  } as const;
  if (persona && !(persona in personaRoles)) {
    return NextResponse.json(
      { error: "Choose owner, manager, staff or freelancer for the local dev persona." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  const requestedRole = persona ? personaRoles[persona as keyof typeof personaRoles] : "agency-owner";
  const selectedUser = requestedRole === "agency-owner"
    ? owner
    : listUsersForAgency(agency.id).find(user => user.role === requestedRole);
  if (!selectedUser) {
    return NextResponse.json(
      {
        error: `No ${persona} identity exists in ${agency.name}.`,
        available: listUsersForAgency(agency.id).map(user => ({ id: user.id, name: user.name, role: user.role })),
      },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  await flushPendingWrites();

  const token = issueSession({
    userId: selectedUser.id,
    email: selectedUser.email,
    role: selectedUser.role,
    agencyId: agency.id,
    agencyIds: selectedUser.agencyIds?.length ? selectedUser.agencyIds : [agency.id],
    activeAgencyId: agency.id,
    clientId: selectedUser.clientId,
    // Marks the session as non-production data without making it read-only.
    isDemo: true,
    sessionRev: selectedUser.sessionRev ?? 0,
  } as never);

  const target = new URL(request.url).searchParams.get("to");
  // Only same-site paths, so `?to=` can never be turned into an open redirect.
  const defaultDestination = selectedUser.role === "agency-staff"
    ? "/portal/team"
    : selectedUser.role === "freelancer"
      ? "/portal/freelancer"
      : "/portal/agency/contacts";
  const destination = localDevDestination(target, defaultDestination, request.url);

  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  const cookie = sessionCookie(token);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set("cache-control", "no-store");
  console.log(
    `[dev-mode] signed in to ${agency.name} (${agency.id}) as ${selectedUser.email} (${selectedUser.role}) · `
    + `${listClients(agency.id).length} clients · backend=${getState() ? "file/memory" : "?"}`,
  );
  return response;
}
