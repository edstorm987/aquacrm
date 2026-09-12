import "server-only";
// T1 R032 — port adapters for `@aqua/plugin-public-funnel` (R021)
// and `@aqua/plugin-bos-auth-gate` (R022).
//
// Capture, promotion and legacy-context ports, from chapters #132 + #137:
//
//   - LeadUserPort.withPendingLeadByEmail(email, operation)
//       Anonymous capture must never create, resolve or reuse an authenticatable
//       account. It allocates only an opaque pending id after refusing every
//       existing User; verified proof or fresh operator authority is the
//       promotion boundary.
//
//   - PendingCapturePromotionAuthorityPort.verify(credential)
//       Resolves an opaque credential against the host's real auth/proof
//       foundation. Raw actor ids and caller-asserted mailbox claims fail.
//
//   - FunnelMePort.getMeContextByUserId(userId)
//       BOS gate's `me` endpoint reads this to populate `hcSlot` +
//       `capturedAt`. Today the public-funnel plugin doesn't expose a
//       container service from the foundation, so this adapter reads
//       the plugin's storage rows directly via the install lookup.
//       Returns null when no funnel install exists or the user isn't
//       a captured lead — graceful no-op so BOS still renders.

import crypto from "node:crypto";
import {
  getActiveAgencyId,
  resolveFreshSessionUser,
  verifyToken,
} from "@/lib/server/auth/auth";
import { withPortalStateTransaction } from "@/server/productWorkspaceCoordinator";
import { getState, mutate } from "@/server/storage";
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
const PUBLIC_FUNNEL_PLUGIN_ID = "public-funnel";
const CAPTURE_ROW_PREFIX = "captures/by-id/";

/** Remove only durable derivatives carrying an exact capture-id field. */
export function erasePublicFunnelCaptureArtifacts(input: {
  agencyId: string;
  captureIds: string[];
}): number {
  const captureIds = new Set(input.captureIds.filter(Boolean));
  if (!captureIds.size) return 0;
  let recordsErased = 0;
  mutate(state => {
    const removedActivityIds = new Set<string>();
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
    for (const [runId, run] of Object.entries(state.automationRuns)) {
      if (run.agencyId !== input.agencyId
        || !hasExactFieldReference(run.eventData, CAPTURE_REFERENCE_FIELDS, captureIds)) {
        continue;
      }
      delete state.automationRuns[runId];
      recordsErased += 1;
    }
  });
  return recordsErased;
}

function publicFunnelHasCanonicalCapture(email: string): boolean {
  const state = getState();
  return Object.values(state.pluginInstalls)
    .filter(install => install.pluginId === PUBLIC_FUNNEL_PLUGIN_ID)
    .some(install => Object.entries(state.pluginData[install.id] ?? {}).some(([key, value]) => {
      if (!key.startsWith(CAPTURE_ROW_PREFIX) || !value || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      const storedEmail = (value as { email?: unknown }).email;
      return typeof storedEmail === "string" && storedEmail.trim().toLowerCase() === email;
    }));
}

export const leadUserPort = {
  async withPendingLeadByEmail<T>(
    email: string,
    operation: (createPendingLead: () => { id: string }) => Promise<T>,
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

      // Pending identities live outside Users, but their canonical address is
      // still one global admission namespace. Inspect only authoritative
      // public-funnel capture rows, across every registered install, while the
      // global transaction is held. That makes two-agency races atomic without
      // treating arbitrary plugin data as identity evidence.
      if (publicFunnelHasCanonicalCapture(norm)) return { created: false };

      let pendingLead: { id: string } | null = null;
      const createPendingLead = () => {
        if (pendingLead) return pendingLead;
        pendingLead = { id: `pending_lead_${crypto.randomBytes(16).toString("hex")}` };
        return pendingLead;
      };
      const value = await operation(createPendingLead);
      if (!pendingLead) throw new Error("public_funnel_pending_lead_not_created");
      return { value, created: true };
    });
  },

  async eraseCaptureArtifacts(input: { agencyId: string; captureIds: string[] }): Promise<{
    recordsErased: number;
  }> {
    return { recordsErased: erasePublicFunnelCaptureArtifacts(input) };
  },

  async eraseIfUnreferenced(input: { userId: string; email: string }): Promise<{
    status: "deleted" | "missing" | "preserved";
    recordsErased: number;
    reason?: "still-referenced" | "ambiguous-user" | "non-capture-lead";
  }> {
    let result: {
      status: "deleted" | "missing" | "preserved";
      recordsErased: number;
      reason?: "still-referenced" | "ambiguous-user" | "non-capture-lead";
    } = { status: "missing", recordsErased: 0 };

    mutate(state => {
      let recordsErased = 0;
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
      const removedActivityIds = new Set<string>();
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

export const pendingCapturePromotionPort = {
  async promote(input: {
    agencyId: string;
    captureId: string;
    email: string;
    source: string;
    actorUserId: string;
    profile?: { name?: string; phone?: string; company?: string };
  }) {
    // Lazy import keeps foundation registration acyclic. This bridge is never
    // reached by anonymous capture; FunnelService calls it only from the
    // authority-bearing promotePendingCapture command.
    const { promoteVerifiedFunnelCapture } = await import("./leadsPipelineFoundation");
    return promoteVerifiedFunnelCapture(input);
  },
};

export const pendingCaptureErasurePort = {
  async erase(input: {
    agencyId: string;
    installId: string;
    captureId: string;
    promotion: {
      leadId: string;
      personId: string;
      prospectId?: string;
      pipelineCardId?: string;
      leadOwned: boolean;
      personOwned: boolean;
      prospectOwned: boolean;
      pipelineCardOwned: boolean;
    };
    erasureSubject?: { clientId: string; personId?: string };
  }) {
    // The caller's install id is part of the public-funnel transaction and is
    // deliberately forwarded for contract/audit binding even though the CRM
    // bridge resolves its own agency-scoped leads install.
    if (!input.installId) throw new Error("public_funnel_promotion_erasure_install_missing");
    const { eraseVerifiedFunnelCapturePromotion } = await import("./leadsPipelineFoundation");
    return eraseVerifiedFunnelCapturePromotion({
      agencyId: input.agencyId,
      captureId: input.captureId,
      promotion: input.promotion,
      erasureSubject: input.erasureSubject,
    });
  },
};

const FUNNEL_PROMOTION_ROLES = new Set(["agency-owner", "agency-manager", "agency-staff"]);

/**
 * Promotion authority is resolved here, outside the plugin. Raw user ids and
 * caller-asserted mailbox addresses are never authority. The current host has
 * no durable mailbox-proof receipt table for pending captures, so that branch
 * fails closed until the verifier that owns such receipts is mounted.
 */
export const pendingCapturePromotionAuthorityPort = {
  async verify(input: {
    agencyId: string;
    installId: string;
    captureId: string;
    captureEmail: string;
    credential:
      | { kind: "mailbox-proof"; receiptId: string }
      | { kind: "authenticated"; sessionToken: string; operationId: string };
  }) {
    const install = getState().pluginInstalls[input.installId];
    if (!install
      || install.pluginId !== PUBLIC_FUNNEL_PLUGIN_ID
      || !install.enabled
      || install.agencyId !== input.agencyId
      || install.clientId) {
      return null;
    }
    if (input.credential.kind !== "authenticated") return null;
    const session = verifyToken(input.credential.sessionToken);
    if (!session
      || session.clientId
      || session.publicShowcase
      || session.isDemo
      || session.sandbox
      || getActiveAgencyId(session) !== input.agencyId) {
      return null;
    }
    const user = await resolveFreshSessionUser(session);
    const memberships = user?.agencyIds.length
      ? user.agencyIds
      : user?.agencyId ? [user.agencyId] : [];
    if (!user
      || user.id !== session.userId
      || user.email.trim().toLowerCase() !== session.email.trim().toLowerCase()
      || user.role !== session.role
      || !FUNNEL_PROMOTION_ROLES.has(user.role)
      || !memberships.includes(input.agencyId)) {
      return null;
    }
    return {
      kind: "authenticated" as const,
      operationId: input.credential.operationId,
      actorUserId: user.id,
      subjectKey: `user:${user.id}`,
    };
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
