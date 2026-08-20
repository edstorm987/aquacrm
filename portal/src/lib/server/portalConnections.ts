import "server-only";

import crypto from "node:crypto";

import type { PendingConfirmationCode } from "./connectionConfirmation";

/**
 * A client's own software, connected to their Aqua portal.
 *
 * The inverse of `IntegrationConnection`, which is Aqua reaching out to GitHub
 * or OpenAI. This is somebody else's application reaching in, and the
 * direction changes who has to prove what.
 *
 * ── Why a connection flow rather than a minted link ─────────────────────────
 *
 * The obvious approach is for their app to mint a signed token and link to it.
 * It works, and it is worse. A minted token is a credential travelling in a
 * URL, so it leaks into history, referrers and logs; it has to be short-lived
 * to be safe, which makes it fragile; and every client needs their own minting
 * setup, so nothing is reusable.
 *
 * Ed's flow inverts it. The link carries a connection id, which is not a
 * credential and grants nothing on its own. The visitor authenticates against
 * Aqua directly — password, two-factor, the same as signing in normally — and
 * only then is the connection made. After that their browser holds an ordinary
 * Aqua session and the sidebar link is a plain link.
 *
 * Nothing secret ever travels between the two systems, the client's software
 * never handles an Aqua credential, and the flow is identical for every
 * client. That last part is the point: one deployment, not a bespoke
 * integration each time.
 */

export type PortalConnectionStatus = "pending" | "active" | "revoked";

export interface PortalConnection {
  id: string;
  agencyId: string;
  clientId: string;
  /** What this is, for the connection screen: "Cedar Dental booking app". */
  label: string;
  /**
   * The origin the software runs on. Recorded at consent rather than trusted
   * from the link, so a connection cannot be claimed from somewhere else.
   */
  origin?: string;
  status: PortalConnectionStatus;
  createdBy: string;
  createdAt: number;
  /**
   * Which portal user completed the connection.
   *
   * Bound at consent and never reassigned. A colleague following the same
   * link gets their own connection or none — inheriting somebody else's
   * would mean one person's two-factor standing in for another's.
   */
  connectedUserId?: string;
  connectedAt?: number;
  /** Last time the Aqua Tag reported from the connected software. */
  lastSeenAt?: number;
  /**
   * How many times the connected software has reported in.
   *
   * Absent means nothing has ever reported — which is not the same as zero
   * uses, and must not be shown as one. Until the Aqua Tag heartbeat exists
   * this is absent on every connection, and the honest reading is "not
   * measured", not "unused".
   */
  uses?: number;
  /** The connection this one replaced, when a link was reset. */
  replacedId?: string;
  revokedAt?: number;
  revokedBy?: string;
  /**
   * The emailed confirmation code awaiting entry — hashed, expiring, single-use.
   *
   * Present only between minting a code and completing the connection. Cleared
   * the moment a code is accepted, which is what makes it single-use: a replay
   * finds nothing to match. Never holds a raw code — only the hash. See
   * `connectionConfirmation.ts`.
   */
  pendingCode?: PendingConfirmationCode;
}

/**
 * How long an unused connection link stays open.
 *
 * A link that was generated, pasted into a document and forgotten should not
 * still be live months later. Seven days is long enough for a client to get
 * round to it and short enough that a stale link is not a permanent invitation.
 */
export const PENDING_CONNECTION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export function newConnectionId(): string {
  // Long and random. Not a credential — it grants nothing without
  // authentication — but a guessable id would let somebody watch a
  // connection screen fill in, which is needless exposure.
  return `pcn_${crypto.randomBytes(18).toString("base64url")}`;
}

export function connectionUrl(origin: string, connectionId: string): string {
  return `${origin.replace(/\/+$/, "")}/connect/${encodeURIComponent(connectionId)}`;
}

/**
 * Which origin a connection link should be built on.
 *
 * The configured public address wins over the host the request happened to
 * arrive on, because the link is for the client rather than for whoever
 * generated it — a link reading `localhost:3032` because Ed made it on his
 * own machine is a link the client cannot open.
 */
export function connectionLinkOrigin(requestOrigin?: string): string {
  return process.env.NEXT_PUBLIC_PORTAL_BASE_URL?.trim()
    || requestOrigin?.trim()
    || "http://localhost:3032";
}

export function createPortalConnection(input: {
  agencyId: string;
  clientId: string;
  label: string;
  createdBy: string;
  now?: number;
}): PortalConnection {
  const label = input.label.trim().slice(0, 160);
  if (!label) throw new Error("A connection needs a name so it can be told from the others.");
  return {
    id: newConnectionId(),
    agencyId: input.agencyId,
    clientId: input.clientId,
    label,
    status: "pending",
    createdBy: input.createdBy,
    createdAt: input.now ?? Date.now(),
  };
}

export type ConnectionRefusal =
  | "unknown"
  | "revoked"
  | "expired"
  | "wrong-client"
  | "already-connected";

export type ConnectionAttempt =
  | { ok: true; connection: PortalConnection }
  | { ok: false; reason: ConnectionRefusal };

/**
 * Whether this signed-in user may complete this connection.
 *
 * Called only once somebody has authenticated — this decides whether their
 * session is the right one, not whether they are who they say they are.
 */
export function canCompleteConnection(input: {
  connection: PortalConnection | undefined;
  viewerClientId: string | undefined;
  viewerUserId: string;
  now?: number;
}): ConnectionAttempt {
  const { connection, viewerClientId, viewerUserId } = input;
  const now = input.now ?? Date.now();

  if (!connection) return { ok: false, reason: "unknown" };
  if (connection.status === "revoked") return { ok: false, reason: "revoked" };

  // Checked before the client match so a stale link reads as stale rather
  // than as a permissions problem, which would send somebody to the wrong
  // person for help.
  if (connection.status === "pending" && now - connection.createdAt > PENDING_CONNECTION_TTL_MS) {
    return { ok: false, reason: "expired" };
  }

  // The link names a client; the session says who is signed in. A mismatch is
  // somebody else's link, and the safe answer is no.
  if (!viewerClientId || viewerClientId !== connection.clientId) {
    return { ok: false, reason: "wrong-client" };
  }

  if (connection.status === "active") {
    // Their own connection, already made — that is a success, not an error,
    // and should land them in the portal rather than at a dead end.
    return connection.connectedUserId === viewerUserId
      ? { ok: true, connection }
      : { ok: false, reason: "already-connected" };
  }

  return { ok: true, connection };
}

export function completeConnection(
  connection: PortalConnection,
  input: { userId: string; origin?: string; now?: number },
): PortalConnection {
  const now = input.now ?? Date.now();
  return {
    ...connection,
    status: "active",
    // Never reassigned once set, so a second person following the link cannot
    // quietly take over a connection somebody else consented to.
    connectedUserId: connection.connectedUserId ?? input.userId,
    connectedAt: connection.connectedAt ?? now,
    origin: input.origin?.trim().slice(0, 300) || connection.origin,
    lastSeenAt: now,
  };
}

/**
 * A fresh link for the same software.
 *
 * The old one is withdrawn rather than left alongside: two live links for one
 * piece of software means whichever arrives second silently fails, and the
 * person holding the first has no way to know theirs is the stale one.
 */
export function resetPortalConnection(
  connection: PortalConnection,
  input: { by: string; now?: number },
): { withdrawn: PortalConnection; replacement: PortalConnection } {
  const now = input.now ?? Date.now();
  return {
    withdrawn: revokePortalConnection(connection, { by: input.by, now }),
    replacement: {
      ...createPortalConnection({
        agencyId: connection.agencyId,
        clientId: connection.clientId,
        label: connection.label,
        createdBy: input.by,
        now,
      }),
      replacedId: connection.id,
    },
  };
}

export function revokePortalConnection(
  connection: PortalConnection,
  input: { by: string; now?: number },
): PortalConnection {
  // Kept as a record rather than deleted: who connected what, and when it was
  // withdrawn, is exactly the history somebody needs after an incident.
  return { ...connection, status: "revoked", revokedAt: input.now ?? Date.now(), revokedBy: input.by };
}

/** Plain-English refusal, written for whoever is looking at the screen. */
export function refusalMessage(reason: ConnectionRefusal): string {
  switch (reason) {
    case "unknown": return "This connection link is not recognised. Ask for a new one.";
    case "revoked": return "This connection has been withdrawn. Ask for a new link.";
    case "expired": return "This link has expired. Ask for a new one and it will work straight away.";
    case "wrong-client": return "This link belongs to a different account. Sign in with the account it was sent to.";
    case "already-connected": return "This software is already connected to somebody else on your account.";
  }
}
