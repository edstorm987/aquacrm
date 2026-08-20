import "server-only";

import { getState, mutate } from "./storage";
import { getUserById } from "./users";
import {
  PENDING_CONNECTION_TTL_MS, canCompleteConnection, completeConnection,
  connectionUrl, createPortalConnection, resetPortalConnection,
  revokePortalConnection, type ConnectionAttempt, type ConnectionRefusal,
  type PortalConnection,
} from "@/lib/server/portal/portalConnections";
import {
  CONFIRMATION_CODE_TTL_MS, generateConfirmationCode, hashConfirmationCode,
} from "@/lib/server/connectionConfirmation";

/**
 * Storage for portal connections.
 *
 * Kept apart from the rules in `@/lib/server/portal/portalConnections` so the
 * decisions — who may complete a connection, when a link is stale, whether a
 * colleague can take one over — are testable without a database. Those are the
 * parts where a mistake is a security hole rather than a bug.
 */

/**
 * A connection as a screen needs it.
 *
 * The link and the expiry are worked out here rather than in the browser
 * because both are server decisions — the origin a client can actually reach,
 * and how long an unused link stays open.
 */
export interface PortalConnectionView extends PortalConnection {
  url: string;
  /** When an unused link stops working. Absent once it has been used. */
  expiresAt?: number;
  /** Who consented, named rather than left as an id nobody can read. */
  connectedUserEmail?: string;
}

export function describePortalConnection(connection: PortalConnection, origin: string): PortalConnectionView {
  return {
    ...connection,
    url: connectionUrl(origin, connection.id),
    ...(connection.status === "pending"
      ? { expiresAt: connection.createdAt + PENDING_CONNECTION_TTL_MS }
      : {}),
    ...(connection.connectedUserId
      ? { connectedUserEmail: getUserById(connection.connectedUserId)?.email }
      : {}),
  };
}

export function listPortalConnections(agencyId: string, clientId?: string): PortalConnection[] {
  return Object.values(getState().portalConnections ?? {})
    .filter(entry => entry.agencyId === agencyId && (!clientId || entry.clientId === clientId))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getPortalConnection(id: string): PortalConnection | undefined {
  return getState().portalConnections?.[id];
}

export function openPortalConnection(input: {
  agencyId: string;
  clientId: string;
  label: string;
  createdBy: string;
}): PortalConnection {
  const connection = createPortalConnection(input);
  mutate(state => {
    state.portalConnections ??= {};
    state.portalConnections[connection.id] = connection;
  });
  return connection;
}

/**
 * Completes a connection for a signed-in client user.
 *
 * The rules are re-checked here against stored state rather than trusting
 * anything the page worked out, because the page's copy could be a moment old
 * — and a revocation that lands in that moment must still take effect.
 */
export function acceptPortalConnection(input: {
  connectionId: string;
  viewerClientId: string | undefined;
  viewerUserId: string;
  origin?: string;
}): ConnectionAttempt {
  const stored = getPortalConnection(input.connectionId);
  const attempt = canCompleteConnection({
    connection: stored,
    viewerClientId: input.viewerClientId,
    viewerUserId: input.viewerUserId,
  });
  if (!attempt.ok) return attempt;

  const connected = completeConnection(attempt.connection, {
    userId: input.viewerUserId,
    origin: input.origin,
  });
  // The emailed code is spent the instant the connection completes. Clearing it
  // here is what makes a code single-use: a replay finds no `pendingCode` to
  // match. Harmless when there never was one (dev bypass, or a test).
  const { pendingCode: _spent, ...withoutCode } = connected;
  void _spent;
  mutate(state => { state.portalConnections[connected.id] = withoutCode; });
  return { ok: true, connection: withoutCode };
}

/**
 * Mints a fresh emailed confirmation code for a connection.
 *
 * Re-checks the same rules as completing it — right client, still open — so a
 * code is never issued for a link the caller could not complete anyway. The
 * raw code is returned once, for the email step; only its hash is stored, with
 * a fifteen-minute expiry, replacing any earlier unused code. A resend is just
 * this called again.
 */
export function issuePortalConnectionCode(input: {
  connectionId: string;
  viewerClientId: string | undefined;
  viewerUserId: string;
  now?: number;
}): { ok: true; code: string; expiresAt: number } | { ok: false; reason: ConnectionRefusal } {
  const stored = getPortalConnection(input.connectionId);
  const attempt = canCompleteConnection({
    connection: stored,
    viewerClientId: input.viewerClientId,
    viewerUserId: input.viewerUserId,
    now: input.now,
  });
  if (!attempt.ok) return attempt;
  // Only a pending link needs a code; an already-active one is done. The rules
  // pass an active connection for its own user, so guard it explicitly.
  if (attempt.connection.status !== "pending") {
    return { ok: false, reason: "already-connected" };
  }

  const now = input.now ?? Date.now();
  const code = generateConfirmationCode();
  const hash = hashConfirmationCode({
    connectionId: input.connectionId,
    userId: input.viewerUserId,
    code,
  });
  const expiresAt = now + CONFIRMATION_CODE_TTL_MS;
  mutate(state => {
    const target = state.portalConnections[input.connectionId];
    if (!target) return;
    target.pendingCode = { hash, expiresAt, attempts: 0 };
  });
  return { ok: true, code, expiresAt };
}

/**
 * Records a wrong code guess against a connection, for lockout.
 *
 * Kept beside the store so the count lives with the code it guards. Returns the
 * running total so the verify endpoint can decide when to lock out.
 */
export function recordPortalConnectionCodeAttempt(connectionId: string): number {
  let attempts = 0;
  mutate(state => {
    const target = state.portalConnections[connectionId];
    if (!target?.pendingCode) return;
    target.pendingCode.attempts += 1;
    attempts = target.pendingCode.attempts;
  });
  return attempts;
}

/**
 * The connections a customer may see and manage — their own, and live.
 *
 * Scoped to the person who consented, not the whole client. Each connection is
 * bound to one user and never reassigned, so "your connected apps" means the
 * ones you connected, not a colleague's. Only active ones: a customer has no
 * use for the history of links that never completed.
 */
export function listOwnPortalConnections(input: {
  clientId: string;
  userId: string;
}): PortalConnection[] {
  return Object.values(getState().portalConnections ?? {})
    .filter(entry =>
      entry.clientId === input.clientId
      && entry.connectedUserId === input.userId
      && entry.status === "active")
    .sort((a, b) => (b.connectedAt ?? 0) - (a.connectedAt ?? 0));
}

/**
 * A customer disconnecting their own software.
 *
 * The promise made on the connect screen — "you can disconnect at any time" —
 * kept from the customer's side. Deliberately narrower than the agency's
 * withdraw: it revokes only a connection this very person consented to, so
 * nobody can reach another user's connection, or another client's, by id.
 */
export function withdrawOwnPortalConnection(input: {
  connectionId: string;
  viewerClientId: string | undefined;
  viewerUserId: string;
}): PortalConnection | null {
  const stored = getPortalConnection(input.connectionId);
  if (
    !stored
    || stored.clientId !== input.viewerClientId
    || stored.connectedUserId !== input.viewerUserId
  ) {
    return null;
  }
  const revoked = revokePortalConnection(stored, { by: input.viewerUserId });
  mutate(state => { state.portalConnections[revoked.id] = revoked; });
  return revoked;
}

export function withdrawPortalConnection(input: {
  agencyId: string;
  connectionId: string;
  by: string;
}): PortalConnection | null {
  const stored = getPortalConnection(input.connectionId);
  // Scoped, so one agency cannot withdraw another's connection by id.
  if (!stored || stored.agencyId !== input.agencyId) return null;
  const revoked = revokePortalConnection(stored, { by: input.by });
  mutate(state => { state.portalConnections[revoked.id] = revoked; });
  return revoked;
}

/**
 * A fresh link for the same software, in place of the old one.
 *
 * The old connection is withdrawn rather than deleted, so the history of what
 * was connected and when survives; the new one carries `replacedId` back to
 * it. Both are written in one mutation, so there is never a moment where the
 * old link is dead and no new one exists.
 */
export function resetPortalConnectionLink(input: {
  agencyId: string;
  connectionId: string;
  by: string;
}): { withdrawn: PortalConnection; replacement: PortalConnection } | null {
  const stored = getPortalConnection(input.connectionId);
  if (!stored || stored.agencyId !== input.agencyId) return null;
  const { withdrawn, replacement } = resetPortalConnection(stored, { by: input.by });
  mutate(state => {
    state.portalConnections[withdrawn.id] = withdrawn;
    state.portalConnections[replacement.id] = replacement;
  });
  return { withdrawn, replacement };
}

/**
 * Removes a connection outright.
 *
 * Distinct from withdrawing, which keeps the record. Deleting is for a link
 * that should never have existed — a typo, a test, a wrong client — where
 * keeping the row is clutter rather than history. Withdraw is the safe default
 * and what the UI leads with; this is the deliberate second choice.
 */
export function deletePortalConnection(input: {
  agencyId: string;
  connectionId: string;
}): PortalConnection | null {
  const stored = getPortalConnection(input.connectionId);
  if (!stored || stored.agencyId !== input.agencyId) return null;
  mutate(state => { delete state.portalConnections[input.connectionId]; });
  return stored;
}

/**
 * Recorded when the Aqua Tag reports from the connected software.
 *
 * Counts as well as timestamps: how often a connection is actually used is the
 * signal that separates a live integration from one that connected once and
 * was never opened again. `uses` starts from nothing and only ever rises.
 */
export function markPortalConnectionSeen(connectionId: string, now = Date.now()): void {
  mutate(state => {
    const stored = state.portalConnections?.[connectionId];
    // Only an active connection has a heartbeat worth recording; a revoked one
    // still reporting is a fact worth noticing, not one to quietly refresh.
    if (!stored || stored.status !== "active") return;
    stored.lastSeenAt = now;
    stored.uses = (stored.uses ?? 0) + 1;
  });
}
