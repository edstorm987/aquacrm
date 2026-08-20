import { NextResponse, type NextRequest } from "next/server";

import {
  authErrorResponse,
  getActiveAgencyId,
  getSessionAgencyIds,
  getSessionFromRequest,
  isSessionFresh,
  issueSession,
  sessionCookie,
} from "@/lib/server/auth/auth";
import { resolvePostLoginPath } from "@/lib/server/auth/postLoginRedirect";
import { logActivity } from "@/server/activity";
import { ensureHydrated } from "@/server/storage";
import { getAgency } from "@/server/tenants";
import { getUserById } from "@/server/users";
import type { SessionPayload } from "@/server/types";

// Company switcher — "I just get a company switcher that loads me in".
//
// One app, one deploy, several companies. A company here is an AGENCY: the
// session already carries `agencyIds[]` + `activeAgencyId`, and switching is
// nothing more than re-minting the cookie with a different `activeAgencyId`.
// There is deliberately no second notion of "current company".
//
// Un-archived from `src/archive/multi-agency/api/agency-switch.ts`, with the
// membership check rebuilt. See the SECURITY block below for what changed and
// why.
//
//   GET  → { ok, activeAgencyId, agencies: [...] }   the switcher's options
//   POST { agencyId } → re-mint + { ok, redirect, agencyId }
//
// ─── SECURITY ─────────────────────────────────────────────────────────────
//
// The only thing that authorises a switch is membership. `agencyId` arrives in
// the request body and is treated as a *request*, never as proof: it is looked
// up inside the intersection of the signed session's `agencyIds` and the live
// user record's `agencyIds`, and a miss is refused.
//
//   • Session ∩ live record, not either alone. The session alone would let a
//     cookie minted before a membership was revoked keep reaching the old
//     tenant; the live record alone would silently WIDEN a session, handing it
//     agencies it was never minted for. The intersection can only ever narrow.
//   • The re-mint copies role/email from the live user record, never from the
//     request and never from the old cookie. This is the shape the
//     preview-as-freelancer escalation was fixed into (a manager could enter →
//     exit and come back an owner because exit restored "an owner it found");
//     here the identity is simply never in play — only which agency is active.
//   • REFUSALS ARE INDISTINGUISHABLE. Not a member, does not exist, archived,
//     paused: every one answers the same 403 `forbidden`. The archived version
//     answered `tenant_scope_mismatch` vs `agency_inactive`, which told an
//     attacker whether an agency id was real. It no longer does.
//   • A borrowed identity cannot switch at all. Demo / Dev Mode / freelancer
//     preview / public showcase sessions are refused outright: those are fenced
//     to one tenant and carry return-markers that a re-mint here would drop,
//     stranding the person with no way back (the exact failure documented in
//     preview-as-freelancer/route.ts).
//   • Same-origin only, and `cache-control: no-store` on every response.

interface SwitchBody {
  agencyId?: unknown;
}

// One row in the switcher. Only ever built from the person's own memberships.
// Deliberately not exported — Next only permits route-handler exports here.
interface SwitchOption {
  id: string;
  name: string;
  slug: string;
  swatch?: string;
}

// One refusal for every "you may not have this agency" case. Same status, same
// body, whether or not the agency exists.
function refuse() {
  return NextResponse.json(
    { ok: false, error: "forbidden" },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}

function noStore<T extends NextResponse>(response: T): T {
  response.headers.set("cache-control", "no-store");
  return response;
}

function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
  const allowed = new Set([requestUrl.origin]);
  if (host) allowed.add(`${protocol}://${host}`);
  try {
    return allowed.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

// A session standing in for somebody else, or fenced to a sandbox tenant.
// Switching from one of these is never right — see the SECURITY block.
function isBorrowedIdentity(session: SessionPayload): boolean {
  return Boolean(
    session.isDemo ||
    session.publicShowcase ||
    session.devReturnAgencyId ||
    session.previewReturnAgencyId ||
    session.showcaseReturnAgencyId,
  );
}

/**
 * Agencies this session may switch to: present in BOTH the signed cookie and
 * the live user record. Order follows the session so the switcher's list is
 * stable across a re-mint.
 */
function switchableAgencyIds(session: SessionPayload, userAgencyIds: string[]): string[] {
  const live = new Set(userAgencyIds);
  return getSessionAgencyIds(session).filter(id => live.has(id));
}

function liveAgencyIds(user: { agencyIds?: string[]; agencyId: string }): string[] {
  return user.agencyIds && user.agencyIds.length > 0 ? user.agencyIds : [user.agencyId];
}

export async function GET(request: NextRequest) {
  try {
    await ensureHydrated();
    const session = await getSessionFromRequest(request);
    if (!session) {
      return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
    }
    const user = getUserById(session.userId);
    if (!user || !isSessionFresh(session, user)) {
      return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
    }

    // Only ever the person's own memberships. This endpoint is not an agency
    // directory and must never become one.
    const agencies: SwitchOption[] = [];
    for (const id of switchableAgencyIds(session, liveAgencyIds(user))) {
      const agency = getAgency(id);
      if (!agency || agency.status !== "active") continue;
      agencies.push({
        id: agency.id,
        name: agency.name,
        slug: agency.slug,
        swatch: agency.brand?.primaryColor,
      });
    }

    return noStore(
      NextResponse.json({
        ok: true,
        activeAgencyId: getActiveAgencyId(session),
        canSwitch: !isBorrowedIdentity(session),
        agencies,
      }),
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHydrated();

    const session = await getSessionFromRequest(request);
    if (!session) {
      return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
    }
    if (!hasValidOrigin(request)) {
      return noStore(NextResponse.json({ ok: false, error: "invalid_origin" }, { status: 403 }));
    }
    if (isBorrowedIdentity(session)) {
      return noStore(
        NextResponse.json(
          { ok: false, error: "Leave the preview before switching company." },
          { status: 409 },
        ),
      );
    }

    const body = (await request.json().catch(() => null)) as SwitchBody | null;
    const requestedAgencyId = typeof body?.agencyId === "string" ? body.agencyId.trim() : "";
    if (!requestedAgencyId) {
      return noStore(
        NextResponse.json({ ok: false, error: "agencyId required." }, { status: 400 }),
      );
    }

    // Live record is authoritative for identity AND for membership.
    const user = getUserById(session.userId);
    if (!user || !isSessionFresh(session, user)) {
      return noStore(NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }));
    }

    // THE BOUNDARY. Everything past this line is inside the person's own
    // memberships; nothing from the body has been trusted.
    const allowed = switchableAgencyIds(session, liveAgencyIds(user));
    if (!allowed.includes(requestedAgencyId)) return refuse();

    const agency = getAgency(requestedAgencyId);
    // Same refusal as "not a member" — deliberately says nothing about
    // whether this agency exists.
    if (!agency || agency.status !== "active") return refuse();

    const token = issueSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      agencyId: agency.id,
      // Narrowed, never widened: the switch cannot be a way to pick up an
      // agency the current cookie was not already minted for.
      agencyIds: allowed,
      activeAgencyId: agency.id,
      clientId: user.clientId,
      sessionRev: user.sessionRev ?? 0,
    });
    const cookie = sessionCookie(token);

    logActivity({
      agencyId: agency.id,
      actorUserId: user.id,
      actorEmail: user.email,
      category: "auth",
      action: "agency.switch",
      message: `${user.email} switched active company to ${agency.name}.`,
    });

    const redirect = resolvePostLoginPath(null, user);
    const response = noStore(
      NextResponse.json({ ok: true, redirect, agencyId: agency.id }),
    );
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    return response;
  } catch (error) {
    return authErrorResponse(error);
  }
}
