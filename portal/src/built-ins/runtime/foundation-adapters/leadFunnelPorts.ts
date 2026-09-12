import "server-only";
// T1 R032 — port adapters for `@aqua/plugin-public-funnel` (R021)
// and `@aqua/plugin-bos-auth-gate` (R022).
//
// Two ports, from chapters #132 + #137:
//
//   - LeadUserPort.withNewLeadByEmail(email, operation)
//       Create-only. Anonymous capture must never resolve or reuse an existing
//       account of any role; returning an existing user here was an account-
//       takeover primitive when the old SessionPort minted its session.
//       Emits no activity here — the plugin layers its own log entry
//       via the ActivityLogPort.
//
//   - FunnelMePort.getMeContextByUserId(userId)
//       BOS gate's `me` endpoint reads this to populate `hcSlot` +
//       `capturedAt`. Today the public-funnel plugin doesn't expose a
//       container service from the foundation, so this adapter reads
//       the plugin's storage rows directly via the install lookup.
//       Returns null when no funnel install exists or the user isn't
//       a captured lead — graceful no-op so BOS still renders.

import crypto from "node:crypto";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { getState, mutate } from "@/server/storage";
import { createUser } from "@/server/users";
import { LEAD_AGENCY_ID } from "@/server/types";
import type { ServerUser } from "@/server/types";

function hasExactFieldReference(
  value: unknown,
  fieldNames: ReadonlySet<string>,
  ids: ReadonlySet<string>,
  depth = 0,
): boolean {
  if (depth > 8 || value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) {
    return value.some(item => hasExactFieldReference(item, fieldNames, ids, depth + 1));
  }
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
    if (fieldNames.has(key)) {
      if (typeof child === "string" && ids.has(child)) return true;
      if (Array.isArray(child) && child.some(item => typeof item === "string" && ids.has(item))) return true;
    }
    return hasExactFieldReference(child, fieldNames, ids, depth + 1);
  });
}

const LEAD_USER_REFERENCE_FIELDS = new Set(["leadUserId"]);
const CAPTURE_REFERENCE_FIELDS = new Set(["captureId", "captureIds"]);

export const leadUserPort = {
  async withNewLeadByEmail<T>(
    email: string,
    operation: (createLead: () => ReturnType<typeof toProfile>) => Promise<T>,
  ): Promise<{ value: T; created: true } | { created: false }> {
    const norm = email.trim().toLowerCase();
    // One global lane is deliberate: the transaction covers both the shared
    // user namespace and the install-scoped capture row. Narrow email or
    // install locks cannot jointly prevent cross-install identity races.
    return withPortalStateTransaction("public-funnel:anonymous-lead-capture", async () => {
      // Scan every scoped key, not only getUser(norm): end-customer identities
      // use `<email>|c:<clientId>` storage keys and are equally protected.
      const existing = Object.values(getState().users).some(user => user.email.trim().toLowerCase() === norm);
      if (existing) return { created: false };

      // Random password keeps password auth unavailable. Mailbox-verified
      // continuation is a separate future flow and is the only place that may
      // authenticate this lead.
      let createdUser: ReturnType<typeof toProfile> | null = null;
      const createLead = () => {
        if (createdUser) return createdUser;
        const password = crypto.randomBytes(24).toString("base64url");
        createdUser = toProfile(createUser({
          email: norm,
          password,
          role: "lead",
          agencyId: LEAD_AGENCY_ID,
          name: norm.split("@")[0] ?? norm,
        }));
        return createdUser;
      };
      const value = await operation(createLead);
      if (!createdUser) throw new Error("public_funnel_lead_not_created");
      return { value, created: true };
    });
  },

  async eraseIfUnreferenced(input: { agencyId: string; userId: string; email: string; captureIds: string[] }): Promise<{
    status: "deleted" | "missing" | "preserved";
    recordsErased: number;
    reason?: "still-referenced" | "ambiguous-user" | "non-capture-lead";
  }> {
    const captureIds = new Set(input.captureIds.filter(Boolean));
    let result: {
      status: "deleted" | "missing" | "preserved";
      recordsErased: number;
      reason?: "still-referenced" | "ambiguous-user" | "non-capture-lead";
    } = { status: "missing", recordsErased: 0 };

    mutate(state => {
      let recordsErased = 0;
      const removedActivityIds = new Set<string>();

      // A capture's exact id is authoritative even when its lead account is
      // shared with a surviving capture. Remove only that capture's own audit
      // rows before deciding whether the global identity may also go.
      state.activity = state.activity.filter(entry => {
        const exactCaptureActivity = entry.agencyId === input.agencyId
          && entry.category === "public-funnel"
          && hasExactFieldReference(entry.metadata, CAPTURE_REFERENCE_FIELDS, captureIds);
        if (!exactCaptureActivity) return true;
        removedActivityIds.add(entry.id);
        recordsErased += 1;
        return false;
      });
      for (const [eventId, event] of Object.entries(state.clientRecordLedger ?? {})) {
        if (event.sourceType === "activity" && removedActivityIds.has(event.sourceId)) {
          delete state.clientRecordLedger[eventId];
          recordsErased += 1;
        }
      }

      const userIds = new Set([input.userId]);
      const stillReferenced = Object.values(state.pluginData).some(installData =>
        Object.values(installData).some(value =>
          hasExactFieldReference(value, LEAD_USER_REFERENCE_FIELDS, userIds),
        ),
      );
      if (stillReferenced) {
        result = { status: "preserved", recordsErased, reason: "still-referenced" };
        return;
      }

      const matches = Object.entries(state.users).filter(([, user]) => user.id === input.userId);
      if (matches.length > 1) {
        result = { status: "preserved", recordsErased, reason: "ambiguous-user" };
        return;
      }
      const match = matches[0];
      if (match) {
        const [key, user] = match;
        const validCaptureLead = user.role === "lead"
          && user.agencyId === LEAD_AGENCY_ID
          && user.agencyIds.length === 0
          && !user.clientId
          && !user.supabaseAuthUserId
          && Boolean(input.email)
          && user.email.trim().toLowerCase() === input.email.trim().toLowerCase()
          && key === user.email.trim().toLowerCase();
        if (!validCaptureLead) {
          result = { status: "preserved", recordsErased, reason: "non-capture-lead" };
          return;
        }
        delete state.users[key];
        recordsErased += 1;
      }

      // Once the exact capture identity is gone, remove its unscoped derived
      // references. Lead capture never authenticates, but legacy registries
      // are scrubbed defensively so a stale cookie cannot retain a pointer.
      state.activity = state.activity.filter(entry => {
        const matchesUser = entry.actorUserId === input.userId
          || hasExactFieldReference(entry.metadata, LEAD_USER_REFERENCE_FIELDS, userIds);
        if (!matchesUser) return true;
        removedActivityIds.add(entry.id);
        recordsErased += 1;
        return false;
      });
      for (const [eventId, event] of Object.entries(state.clientRecordLedger ?? {})) {
        if (event.sourceType === "activity" && removedActivityIds.has(event.sourceId)) {
          delete state.clientRecordLedger[eventId];
          recordsErased += 1;
        }
      }
      for (const [eventId, event] of Object.entries(state.outbox ?? {})) {
        if (event.name === "user.signed_up"
          && event.source === "server/users"
          && event.payload.userId === input.userId) {
          delete state.outbox[eventId];
          recordsErased += 1;
        }
      }
      for (const [key, day] of Object.entries(state.personalMetricDays)) {
        if (day.userId !== input.userId) continue;
        delete state.personalMetricDays[key];
        recordsErased += 1;
      }
      if (state.securityControl) {
        if (Object.prototype.hasOwnProperty.call(state.securityControl.userEpochs, input.userId)) {
          delete state.securityControl.userEpochs[input.userId];
          recordsErased += 1;
        }
        if (Object.prototype.hasOwnProperty.call(state.securityControl.suspendedUsers, input.userId)) {
          delete state.securityControl.suspendedUsers[input.userId];
          recordsErased += 1;
        }
        for (const [sid, session] of Object.entries(state.securityControl.sessions)) {
          if (session.userId !== input.userId) continue;
          delete state.securityControl.sessions[sid];
          recordsErased += 1;
        }
      }
      result = { status: match ? "deleted" : "missing", recordsErased };
    });
    return result;
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
      const [{ publicFunnelContainerFor }, { listAgencies }, { getInstall }, { makePluginStorage }] =
        await Promise.all([
          import("./publicFunnelFoundation"),
          import("@/server/tenants"),
          import("@/server/pluginInstalls"),
          import("@/lib/server/pluginStorage"),
        ]);
      for (const agency of listAgencies()) {
        const install = getInstall({ agencyId: agency.id }, "public-funnel");
        if (!install) continue;
        const storage = makePluginStorage(install.id);
        const container = publicFunnelContainerFor({
          agencyId: agency.id,
          storage: storage as unknown as Parameters<typeof publicFunnelContainerFor>[0]["storage"],
          install: install as unknown as Parameters<typeof publicFunnelContainerFor>[0]["install"],
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
  const users = getState().users as Record<string, ServerUser>;
  for (const u of Object.values(users)) {
    if (u.id === userId) return u;
  }
  return null;
}

function toProfile(u: ServerUser) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}
