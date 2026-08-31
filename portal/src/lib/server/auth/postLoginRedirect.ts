// Post-login redirect resolver (T1 R022 — chapter
// `04-post-login-redirect.md`).
//
// Maps a session/user pair to the correct landing path so /login,
// /signup and /api/auth/magic/verify both route to the same
// place per role. Returns a same-origin path; callers compose absolute
// URLs at the boundary.
//
// Routing table (chapter #124 WS-A R022):
//   agency-owner / agency-manager                     → /portal/agency
//   agency-staff                                      → /portal/team
//   client-owner / client-staff                       → /portal/customer
//   freelancer                                        → /portal/freelancer
//   end-customer                                      → /portal/customer
//   lead (not portal-scoped yet)                      → /login
//
// Client placement (changed 2026-08-27, same decision as
// `src/app/portal/page.tsx`): `/portal/clients/<slug>` is the INTERNAL
// workspace for Ed and his employees, so a `client-owner` /
// `client-staff` signing in belongs in `/portal/customer` — their own
// portal, whose host gate admits `CUSTOMER_PORTAL_ROLES`. Sending them
// to the internal workspace put a client inside Ed's workspace, and
// contradicted `/portal`'s own redirect.
//
// Client-scoped fallback: when the user is `client-*` but their
// `clientId` no longer resolves (client deleted / archived), we route
// to `/portal/agency`. The login route's defense-in-depth check refuses
// the sign-in earlier in that case for primary auth, but magic-link
// flows can still exercise this branch. The lookup is kept purely as
// that existence check — the destination no longer needs the slug.
//
// This resolver is the ONE answer to "where does this role belong?".
// `/portal/account` and the portal 404 read it too, so a back-link
// never contradicts where sign-in would have sent the same person.

import type { SessionPayload, ServerUser } from "@/server/types";
import { getClient } from "@/server/tenants";

interface ResolveInput {
  role: SessionPayload["role"];
  clientId?: string | null;
}

export interface ResolveOptions {
  // Defaults to the live `getClient` from server/tenants. Tests inject
  // a stub so the resolver can be exercised without hydrating storage.
  clientLookup?: (id: string) => { slug: string } | null;
}

export function resolvePostLoginPath(
  session: SessionPayload | null | undefined,
  user?: Pick<ServerUser, "role" | "clientId"> | null,
  opts: ResolveOptions = {},
): string {
  const lookup = opts.clientLookup ?? getClient;
  // Prefer the user record (fresher; survives session staleness) and
  // fall back to the session payload.
  const src: ResolveInput | null = user
    ? { role: user.role, clientId: user.clientId ?? null }
    : session
      ? { role: session.role, clientId: session.clientId ?? null }
      : null;
  if (!src) return "/login";

  switch (src.role) {
    case "agency-owner":
    case "agency-manager":
      return "/portal/agency";
    case "agency-staff":
      return "/portal/team";
    case "client-owner":
    case "client-staff": {
      if (!src.clientId) return "/portal/agency";
      const client = lookup(src.clientId);
      if (!client) return "/portal/agency";
      return "/portal/customer";
    }
    case "freelancer":
      return "/portal/freelancer";
    case "end-customer":
      return "/portal/customer";
    case "lead":
      return "/login";
    default:
      return "/portal/agency";
  }
}
