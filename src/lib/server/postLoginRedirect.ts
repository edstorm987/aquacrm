// Post-login redirect resolver (T1 R022 — chapter
// `04-post-login-redirect.md`).
//
// Maps a session/user pair to the correct landing path so /login,
// /signup, /api/auth/magic/verify and /dev/pov all route to the same
// place per role. Returns a same-origin path; callers compose absolute
// URLs at the boundary.
//
// Routing table (chapter #124 WS-A R022):
//   agency-owner / agency-manager / agency-staff      → /portal/agency
//   client-owner / client-staff / freelancer          → /portal/clients/<slug>
//   end-customer                                      → /portal/customer
//   lead (R023 — defensive ahead of role landing)     → /business-os
//
// Client-scoped fallback: when the user is `client-*` but their
// `clientId` no longer resolves (client deleted / archived), we route
// to `/portal/agency`. The login route's defense-in-depth check refuses
// the sign-in earlier in that case for primary auth, but POV bypass +
// magic-link flows can still exercise this branch.

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
    case "agency-staff":
      return "/portal/agency";
    case "client-owner":
    case "client-staff":
    case "freelancer": {
      if (!src.clientId) return "/portal/agency";
      const client = lookup(src.clientId);
      if (!client) return "/portal/agency";
      return `/portal/clients/${client.slug}`;
    }
    case "end-customer":
      return "/portal/customer";
    case "lead":
      return "/business-os";
    default:
      return "/portal/agency";
  }
}
