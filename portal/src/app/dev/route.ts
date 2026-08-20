import { NextResponse } from "next/server";
import crypto from "crypto";

import { issueSession, sessionCookie } from "@/lib/server/auth/auth";
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
import { ensureHydrated, flushPendingWrites, getState } from "@/server/storage";

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

  await ensureHydrated();

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

    // `end-customer`, not `client-owner`: the customer portal layout requires
    // that role, and the customer portal is where the connect flow sends
    // people. A `client-owner` following the same link signs in fine and then
    // lands somewhere else entirely — a real question, but not this route's
    // to answer.
    const clientUser = listUsersForClient(client.id).find(user => user.role === "end-customer")
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
    const clientDestination = clientTarget?.startsWith("/") && !clientTarget.startsWith("//")
      ? clientTarget
      : "/portal/customer";
    const clientResponse = NextResponse.redirect(new URL(clientDestination, request.url), 303);
    const cookie = sessionCookie(clientToken);
    clientResponse.cookies.set(cookie.name, cookie.value, cookie.options);
    clientResponse.headers.set("cache-control", "no-store");
    console.log(`[dev-mode] signed in as ${clientUser.email} on client ${client.name} (${client.id})`);
    return clientResponse;
  }

  await flushPendingWrites();

  const token = issueSession({
    userId: owner.id,
    email: owner.email,
    role: owner.role,
    agencyId: agency.id,
    agencyIds: [agency.id],
    activeAgencyId: agency.id,
    // Marks the session as non-production data without making it read-only.
    isDemo: true,
    sessionRev: owner.sessionRev ?? 0,
  } as never);

  const target = new URL(request.url).searchParams.get("to");
  // Only same-site paths, so `?to=` can never be turned into an open redirect.
  const destination = target?.startsWith("/") && !target.startsWith("//")
    ? target
    : "/portal/agency/contacts";

  const response = NextResponse.redirect(new URL(destination, request.url), 303);
  const cookie = sessionCookie(token);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set("cache-control", "no-store");
  console.log(
    `[dev-mode] signed in to ${agency.name} (${agency.id}) as ${owner.email} · `
    + `${listClients(agency.id).length} clients · backend=${getState() ? "file/memory" : "?"}`,
  );
  return response;
}
