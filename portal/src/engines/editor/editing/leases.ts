/**
 * Telling people somebody is already in here.
 *
 * The conflict check catches a collision after the fact: it refuses the second
 * edit and keeps the first. That protects the data but wastes the work — the
 * second person typed a paragraph before finding out. A lease is the other
 * half, and the more useful one day to day: it says who is editing before
 * anybody starts, so the collision mostly does not happen.
 *
 * It is advisory on purpose. A banner cannot stop a write — somebody with the
 * page already open never saw it, a second tab does not know about the first,
 * and browsers close without telling anyone. So the lease prevents collisions
 * and the fingerprint check catches the ones that happen anyway. Removing
 * either brings back silent overwriting for the cases the other covers.
 */

export interface EditLease {
  documentId: string;
  holderId: string;
  /** Shown in the banner — "Ed is editing", not a user id. */
  holderName: string;
  startedAt: number;
  /**
   * When this stops counting.
   *
   * Leases expire rather than being held until released, because the common
   * way an edit ends is a closed laptop, not a click. A lock nobody can clear
   * is worse than no lock: it blocks the work and there is no obvious way to
   * get it back.
   */
  expiresAt: number;
}

/** Long enough to think, short enough that a closed tab clears quickly. */
export const LEASE_DURATION_MS = 2 * 60 * 1_000;

export function isLeaseActive(lease: EditLease | undefined, now: number): boolean {
  return Boolean(lease && lease.expiresAt > now);
}

/**
 * Who is looking, which decides how firmly they are told.
 *
 * The two sides are not symmetrical and should not pretend to be. Aqua owns
 * the work, so an agency user is told and left to judge — locking them out of
 * their own client's portal because a colleague has a tab open would be
 * absurd. A client editing at the same time as Aqua produces changes that are
 * about to be overwritten by work already in progress, so they are stopped and
 * given somewhere to put the request instead.
 */
export type EditorAudience = "agency" | "client";

export type LeaseStatus =
  /** Nobody is editing, or the lease is yours. */
  | { state: "clear"; lease?: EditLease }
  /** Somebody else is editing right now. */
  | { state: "held"; lease: EditLease; heldForMs: number; access: "advisory" | "blocked" };

export function leaseStatus(input: {
  lease?: EditLease;
  viewerId: string;
  now: number;
  /** Defaults to the agency: the stricter behaviour is never the default. */
  viewer?: EditorAudience;
  /** Who holds the lease, when that is known. */
  holder?: EditorAudience;
}): LeaseStatus {
  const { lease, viewerId, now } = input;
  if (!isLeaseActive(lease, now)) return { state: "clear" };
  // Your own lease in another tab is not a collision — it is you. Warning
  // somebody about themselves teaches them to ignore the banner.
  if (lease!.holderId === viewerId) return { state: "clear", lease };

  const viewer = input.viewer ?? "agency";
  const holder = input.holder ?? "agency";
  // A client is blocked only while Aqua is the one working. Two clients
  // colliding is their own business, and the conflict check still covers it.
  const access = viewer === "client" && holder === "agency" ? "blocked" as const : "advisory" as const;
  return { state: "held", lease: lease!, heldForMs: now - lease!.startedAt, access };
}

/**
 * What the banner says.
 *
 * Names the person and how long they have been in there. "Somebody is editing"
 * gives the reader nothing to act on; "Ed has been editing for 20 minutes"
 * tells them whether to wait or to go and ask.
 */
export function leaseNotice(status: LeaseStatus): string | null {
  if (status.state !== "held") return null;
  const minutes = Math.floor(status.heldForMs / 60_000);
  const since = minutes < 1 ? "just now" : minutes === 1 ? "for a minute" : `for ${minutes} minutes`;
  // A client is not told which member of staff it is, or for how long. That
  // reads as an excuse; what they need is that it is in hand and what to do.
  if (status.access === "blocked") {
    return "Aqua is making changes to your portal right now. Anything you change would be overwritten, so it is locked for a moment.";
  }
  return `${status.lease.holderName} is making changes here ${since}. Please leave it until they are done.`;
}

/**
 * Whether the lease can be taken over.
 *
 * Allowed, but only once it is clearly abandoned rather than merely quiet.
 * Somebody on holiday with a tab open must not be able to block a client's
 * portal indefinitely — and a takeover is safe because the fingerprint check
 * still refuses any edit that would overwrite their work.
 */
export const TAKEOVER_AFTER_MS = 10 * 60 * 1_000;

export function canTakeOver(status: LeaseStatus, now: number): boolean {
  if (status.state !== "held") return true;
  return now - status.lease.expiresAt >= 0 || status.heldForMs >= TAKEOVER_AFTER_MS;
}

/** Claims or renews a lease for one editor. */
export function claimLease(input: {
  documentId: string;
  holderId: string;
  holderName: string;
  existing?: EditLease;
  now: number;
}): { lease: EditLease; claimed: boolean } {
  const { documentId, holderId, holderName, existing, now } = input;
  const status = leaseStatus({ lease: existing, viewerId: holderId, now });

  if (status.state === "held" && !canTakeOver(status, now)) {
    return { lease: existing!, claimed: false };
  }

  return {
    lease: {
      documentId,
      holderId,
      holderName,
      // Renewing keeps the original start, so the banner reports how long
      // somebody has really been editing rather than resetting every heartbeat.
      startedAt: status.lease?.holderId === holderId ? status.lease.startedAt : now,
      expiresAt: now + LEASE_DURATION_MS,
    },
    claimed: true,
  };
}
