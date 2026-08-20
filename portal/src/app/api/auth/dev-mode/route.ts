import { NextResponse, type NextRequest } from "next/server";

import {
  authErrorResponse,
  getSessionFromRequest,
  issueSession,
  sessionCookie,
} from "@/lib/server/auth/auth";
import { canUseDevMode } from "@/lib/server/dev/devModeAccess";
import { devModeStatus } from "@/lib/server/dev/devMode";
import { effectiveRole } from "@/lib/server/auth/effectiveRole";
import { seedDemoAgency, ensureDemoStaffEmployee, ensureDemoCustomerReady, ensureDemoFreelancer, DEMO_STAFF_EMAIL, DEMO_FREELANCER_EMAIL, type SeedDemoResult } from "@/lib/server/seeds/demoSeed";
import type { ServerUser, SessionPayload } from "@/server/types";
import { ensureHydrated, flushPendingWrites } from "@/server/storage";
import { getAgency } from "@/server/tenants";
import { getUser, getUserById, listUsersForAgency } from "@/server/users";

// Dev Mode — the demo-persona POV switcher (local/dev only for now).
//
// POST { action: "enter" | "switch" | "exit", persona? }.
//   enter  → seed the fenced `demo-agency`, re-mint the cookie as the demo
//            OWNER (isDemo), stashing the founder's real agency in
//            `devReturnAgencyId` so exit/switch can carry it forward.
//   switch → re-mint as another demo persona (owner / staff / client) in the
//            same fenced tenant, preserving `devReturnAgencyId`. Hop POV with
//            no re-login.
//   exit   → re-mint the founder's real session from `devReturnAgencyId`.
//
// The entire feature hangs off ONE availability switch — `canUseDevMode()` —
// checked first, before anything else. When it is off the route answers 404
// and behaves as if it does not exist, so Dev Mode cannot be reached in
// production. (See devModeAccess.ts for the future prod path.)
//
// Authority model:
//   • enter is the only privileged step: only the REAL founder may START Dev
//     Mode. (A demo-owner session also resolves to Founder, but it never needs
//     to re-enter — it switches or exits.)
//   • switch / exit require an ACTIVE Dev Mode session — one carrying a
//     `devReturnAgencyId`, which is a founder-authorised, HMAC-signed
//     capability minted by `enter`. The demo CLIENT persona is not a founder,
//     so gating those on `isFounder` would trap you as the client; the signed
//     capability is the correct authority instead. Every mint is fenced to the
//     demo agency, so switch can never reach a real tenant.
// All actions are same-origin.

type Action = "enter" | "switch" | "exit";
// A client/customer sees a PORTAL, never the agency-side per-client workspace
// (that `/portal/clients/<id>` surface is Ed's internal operating view). So the
// customer POV is the end-customer on the customer portal, not a `client-owner`.
// The freelancer POV is their OWN limited workspace (assigned jobs only).
type Persona = "owner" | "staff" | "customer" | "freelancer";

function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  const allowedOrigins = new Set([requestUrl.origin]);

  if (host) allowedOrigins.add(`${protocol}://${host}`);

  try {
    return allowedOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

// A demo POV: which seeded user to become, the client scope, and where they
// land (mirrors the /portal role dispatch).
interface PovTarget {
  user: ServerUser;
  clientId?: string;
  landing: string;
}

function resolvePersona(persona: Persona, seed: SeedDemoResult): PovTarget | null {
  switch (persona) {
    case "owner":
      return { user: seed.ownerUser, landing: "/portal/agency" };
    case "staff": {
      const staff = getUser(DEMO_STAFF_EMAIL);
      return staff ? { user: staff, landing: "/portal/team" } : null;
    }
    case "customer":
      // The seeded end-customer on the fenced demo client → the real
      // client-facing customer portal (only shared info, brand-painted).
      return { user: seed.customerUser, clientId: seed.client.id, landing: "/portal/customer" };
    case "freelancer": {
      // The seeded freelancer → their own limited workspace (assigned jobs
      // only). No clientId on the session — the workspace resolves by their
      // linked PeopleEmployee, not client scope.
      const freelancer = getUser(DEMO_FREELANCER_EMAIL);
      return freelancer ? { user: freelancer, landing: "/portal/freelancer" } : null;
    }
    default:
      return null;
  }
}

function mintPov(
  target: PovTarget,
  returnAgencyId: string,
  demoAgencyId: string,
  returnWasDemo: boolean,
  returnUserId?: string,
): string {
  return issueSession({
    userId: target.user.id,
    email: target.user.email,
    role: target.user.role,
    agencyId: demoAgencyId,
    activeAgencyId: demoAgencyId,
    agencyIds: [demoAgencyId],
    clientId: target.clientId,
    isDemo: true,
    devReturnAgencyId: returnAgencyId,
    devReturnWasDemo: returnWasDemo,
    // Who to come back as. Carried through every hop so exit restores the
    // person who started the inspection, not "an owner in that agency".
    devReturnUserId: returnUserId,
    sessionRev: target.user.sessionRev ?? 0,
  });
}

function isActiveDevSession(session: SessionPayload): boolean {
  return Boolean(session.isDemo && session.devReturnAgencyId);
}

export async function POST(request: NextRequest) {
  try {
    // The one switch point. Off → the route does not exist. This is the #1
    // security contract: Dev Mode cannot be minted anywhere it is not allowed.
    if (!canUseDevMode()) {
      const status = devModeStatus();
      return NextResponse.json(
        { ok: false, error: "Dev Mode is not available.", reason: status.reason },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }

    await ensureHydrated();

    // Read the signed session straight off the request (like the sibling
    // preview-as-client-at-phase route) so the mint is driveable in-process.
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    if (!hasValidOrigin(request)) {
      return NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 });
    }

    const body = await request.json().catch(() => null) as { action?: Action; persona?: Persona } | null;
    const action = body?.action;
    if (action !== "enter" && action !== "switch" && action !== "exit") {
      return NextResponse.json({ ok: false, error: "Choose enter, switch, or exit." }, { status: 400 });
    }

    if (action === "exit") {
      if (!isActiveDevSession(session)) {
        return NextResponse.json({ ok: false, error: "This session is not in Dev Mode." }, { status: 409 });
      }
      const returnAgency = getAgency(session.devReturnAgencyId!);
      if (!returnAgency) {
        return NextResponse.json({ ok: false, error: "No live workspace is attached to this Dev Mode session." }, { status: 409 });
      }
      // The demo session's userId is a demo persona, so recover who to return
      // to. Prefer the EXACT person who started the inspection — that is what
      // lets Ed inspect a persona and come back as himself, and it closes the
      // same escalation the freelancer preview was fixed for. Legacy cookies
      // minted before `devReturnUserId` existed fall back to the old owner
      // lookup so an in-flight session isn't stranded.
      const stashed = session.devReturnUserId ? getUserById(session.devReturnUserId) : null;
      const inReturnAgency = stashed
        && (stashed.agencyIds?.length ? stashed.agencyIds.includes(returnAgency.id) : stashed.agencyId === returnAgency.id);
      const owner = inReturnAgency
        ? stashed
        : listUsersForAgency(returnAgency.id).find(user => user.role === "agency-owner");
      if (!owner) {
        return NextResponse.json({ ok: false, error: "No account found to return to for the live workspace." }, { status: 409 });
      }
      const token = issueSession({
        userId: owner.id,
        email: owner.email,
        role: owner.role,
        agencyId: returnAgency.id,
        activeAgencyId: returnAgency.id,
        agencyIds: owner.agencyIds && owner.agencyIds.length > 0 ? owner.agencyIds : [returnAgency.id],
        // Restore the origin's demo-ness: a local `/dev` founder came in on an
        // isDemo session (no Supabase identity), so return them to one — else
        // getSession()'s Supabase cross-check rejects it and bounces to /login.
        isDemo: session.devReturnWasDemo === true ? true : undefined,
        sessionRev: owner.sessionRev ?? 0,
      });
      return sessionResponse(token, "/portal/agency");
    }

    if (action === "switch") {
      // Two ways to start an inspection:
      //   • already inside Dev Mode → hop persona (the signed capability).
      //   • a real founder → step straight in from their OWN session. This is
      //     what keeps Ed as Ed in the Dev Team workspace: he never swaps
      //     identity to browse it, only to inspect a persona — and we stash who
      //     he is so exit brings him back to himself.
      const fromRealFounder = !isActiveDevSession(session)
        && session.role === "agency-owner"
        && effectiveRole(session).isFounder;
      if (!isActiveDevSession(session) && !fromRealFounder) {
        return NextResponse.json({ ok: false, error: "Enter Dev Mode before switching persona." }, { status: 409 });
      }
      const persona = body?.persona;
      if (persona !== "owner" && persona !== "staff" && persona !== "customer" && persona !== "freelancer") {
        return NextResponse.json({ ok: false, error: "Choose owner, staff, customer, or freelancer." }, { status: 400 });
      }
      const seed = await seedDemoAgency(session.userId);
      // Guarantee each persona lands on a real workspace/portal (the memoised
      // seed may have run in a prior process, before these existed): staff
      // needs a PeopleEmployee, the customer needs welcome-complete (or the
      // portal bounces to /setup), the freelancer needs an employee + a job.
      ensureDemoStaffEmployee(seed.agency.id, session.userId);
      ensureDemoCustomerReady(seed.agency.id);
      ensureDemoFreelancer(seed.agency.id);
      await flushPendingWrites();
      const target = resolvePersona(persona, seed);
      if (!target) {
        return NextResponse.json({ ok: false, error: `The demo ${persona} persona is not seeded.` }, { status: 409 });
      }
      // Where to come back to. Hopping inside Dev Mode carries the existing
      // pointer forward; stepping in from a real session stashes THAT session
      // (agency + exact user + demo-ness) so exit restores the person who
      // started the inspection.
      const returnAgencyId = session.devReturnAgencyId ?? session.agencyId;
      const returnWasDemo = session.devReturnAgencyId
        ? session.devReturnWasDemo === true
        : session.isDemo === true;
      const returnUserId = session.devReturnUserId ?? (fromRealFounder ? session.userId : undefined);
      const token = mintPov(target, returnAgencyId, seed.agency.id, returnWasDemo, returnUserId);
      return sessionResponse(token, target.landing);
    }

    // enter — the only privileged step: real founder starts Dev Mode as the
    // demo owner.
    if (session.role !== "agency-owner" || !effectiveRole(session).isFounder) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    const seed = await seedDemoAgency(session.userId);
    // Persist the seeded personas so a follow-up request on the file backend
    // resolves them (mirrors app/dev/route.ts).
    await flushPendingWrites();

    // Keep the real return target when re-entering from an existing demo
    // session, otherwise stash the current (real) agency + whether that origin
    // session was itself demo/dev (so exit can restore an accepted session).
    const returnAgencyId = session.devReturnAgencyId ?? session.agencyId;
    const returnWasDemo = session.devReturnAgencyId
      ? session.devReturnWasDemo === true
      : session.isDemo === true;
    // Stash the exact person entering, so exit restores THEM rather than
    // whichever owner the agency lookup happens to find first.
    const returnUserId = session.devReturnUserId ?? session.userId;
    const token = mintPov(
      { user: seed.ownerUser, landing: "/portal/agency" },
      returnAgencyId,
      seed.agency.id,
      returnWasDemo,
      returnUserId,
    );
    // Entering Dev Mode lands in the Dev Team portal — our own internal
    // workspace (Library / Auditor / Profiles / Updates / Notes / Librarian).
    // The cinematic load-in wraps this transition.
    return sessionResponse(token, "/portal/dev-team");
  } catch (error) {
    return authErrorResponse(error);
  }
}

function sessionResponse(token: string, redirect: string) {
  const cookie = sessionCookie(token);
  const response = NextResponse.json({ ok: true, redirect });
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  response.headers.set("cache-control", "no-store");
  return response;
}
