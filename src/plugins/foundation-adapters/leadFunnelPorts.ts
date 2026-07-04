import "server-only";
// T1 R032 — port adapters for `@aqua/plugin-public-funnel` (R021)
// and `@aqua/plugin-bos-auth-gate` (R022).
//
// Three ports, all from chapters #132 + #137:
//
//   - LeadUserPort.upsertLeadByEmail(email)
//       Idempotent on email. Calls foundation `createUser({role:"lead"})`
//       on first capture; returns existing lead user on re-capture.
//       Emits no activity here — the plugin layers its own log entry
//       via the ActivityLogPort.
//
//   - SessionPort.issueSession(userId)
//       Wraps T1's `issueSession` so the plugin handler can set a
//       session cookie on its response without the plugin importing
//       the foundation auth module directly.
//
//   - FunnelMePort.getMeContextByUserId(userId)
//       BOS gate's `me` endpoint reads this to populate `hcSlot` +
//       `capturedAt`. Today the public-funnel plugin doesn't expose a
//       container service from the foundation, so this adapter reads
//       the plugin's storage rows directly via the install lookup.
//       Returns null when no funnel install exists or the user isn't
//       a captured lead — graceful no-op so BOS still renders.

import crypto from "node:crypto";
import { issueSession as foundationIssueSession } from "@/lib/server/auth";
import { createUser, getUser } from "@/server/users";
import { LEAD_AGENCY_ID } from "@/server/types";
import type { ServerUser } from "@/server/types";

interface LeadUpsertResult {
  user: { id: string; email: string; name?: string; role?: string };
  created: boolean;
}

export const leadUserPort = {
  async upsertLeadByEmail(email: string): Promise<LeadUpsertResult> {
    const norm = email.trim().toLowerCase();
    const existing = getUser(norm);
    if (existing) {
      return { user: toProfile(existing), created: false };
    }
    // Random password — leads use magic-link / session re-issue, not
    // password auth. createUser still validates length, so we generate
    // a random secret long enough to satisfy validatePassword.
    const password = crypto.randomBytes(24).toString("base64url");
    const user = createUser({
      email: norm,
      password,
      role: "lead",
      agencyId: LEAD_AGENCY_ID,
      name: norm.split("@")[0] ?? norm,
    });
    return { user: toProfile(user), created: true };
  },
};

export const sessionPort = {
  issueSession(userId: string): string {
    const u = getUserById(userId);
    if (!u) throw new Error(`[sessionPort] user ${userId} not found`);
    return foundationIssueSession({
      userId: u.id,
      email: u.email,
      role: u.role,
      agencyId: u.agencyId,
      sessionRev: u.sessionRev ?? 0,
    });
  },
};

// `FunnelMePort` adapter. Reads HC slot + capture timestamp from the
// public-funnel plugin's container (chapter #161 Gap #4 closure).
// Walks every agency's public-funnel install until it finds a capture
// for this user — leads aren't bound to a single agency, so the first
// install with a matching capture wins. Falls back to a skeleton
// (just user identity) when no funnel install exists, no capture is
// found, or any plugin import fails — BOS's `me` endpoint always
// renders.
export const funnelMePort = {
  async getMeContextByUserId(userId: string): Promise<{
    leadUserId: string;
    email: string;
    hcSlot?: Record<string, unknown>;
    capturedAt?: number;
  } | null> {
    const u = getUserById(userId);
    if (!u) return null;
    if (u.role !== "lead") return null;

    // Honest skeleton — we always return at least identity. Hydrate
    // hcSlot + capturedAt from public-funnel storage when reachable.
    const skeleton = {
      leadUserId: u.id,
      email: u.email,
      hcSlot: undefined as Record<string, unknown> | undefined,
      capturedAt: u.createdAt as number | undefined,
    };

    try {
      const [{ containerFor }, { listAgencies }, { getInstall }, { makePluginStorage }] =
        await Promise.all([
          import("@aqua/plugin-public-funnel/server"),
          import("@/server/tenants"),
          import("@/server/pluginInstalls"),
          import("@/lib/server/pluginStorage"),
        ]);
      for (const agency of listAgencies()) {
        const install = getInstall({ agencyId: agency.id }, "public-funnel");
        if (!install) continue;
        const storage = makePluginStorage(install.id);
        const container = containerFor({
          agencyId: agency.id,
          storage: storage as unknown as Parameters<typeof containerFor>[0]["storage"],
          install: install as unknown as Parameters<typeof containerFor>[0]["install"],
        });
        const ctx = await container.funnel.meContext(u.id);
        if (ctx) {
          return {
            leadUserId: u.id,
            email: u.email,
            ...(ctx.hcSlot !== undefined ? { hcSlot: ctx.hcSlot } : {}),
            capturedAt: ctx.captures[0]?.capturedAt ?? u.createdAt,
          };
        }
      }
    } catch {
      // Any failure (plugin not installed yet on this tenant, schema
      // drift, missing module) → fall through to skeleton. BOS gate
      // tolerates undefined hcSlot per chapter #137.
    }
    return skeleton;
  },
};

function getUserById(userId: string): ServerUser | null {
  // Users are keyed by email-composite in storage; we don't have a
  // direct id index. Walk the storage map — fine for low-volume lead
  // counts. R+1 wires a proper users-by-id index.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getState } = require("@/server/storage") as typeof import("@/server/storage");
  const users = getState().users as Record<string, ServerUser>;
  for (const u of Object.values(users)) {
    if (u.id === userId) return u;
  }
  return null;
}

function toProfile(u: ServerUser) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
