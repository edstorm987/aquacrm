// Sender-identity service. CRUD on SenderIdentity rows + verification.
//
// ── Verification is the provider's answer, never ours ────────────────────
//
// `verifyDomain` used to set `status: "active"` and stamp `verifiedAt` the
// instant it was called, for any address, with no provider contacted. Every
// downstream surface — the health component, the Settings table, the "verified"
// column — then reported an unearned pass, and the operator had no way to tell
// it from a real one. It was the same shape as the editor's fake `verifyDomain`
// this codebase already had to tear out.
//
// Now the active provider's driver is asked, and only its evidence flips an
// identity to `active`. A provider that cannot be asked (`none`), a driver with
// no `verifyIdentity` (SMTP has no sender registry; SendGrid/Resend are stubs),
// a missing credential, or a "no" from the provider all leave the identity
// `pending` and record WHY on the row.

import { makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, UserId } from "../lib/tenancy";
import type {
  CreateIdentityInput,
  IdentityVerification,
  ProviderKind,
  SenderIdentity,
  UpdateIdentityPatch,
} from "../lib/domain";
import type {
  ActivityLogPort,
  DriverContext,
  EmailDriver,
  EventBusPort,
  StoragePort,
} from "./ports";
import type { ProviderService } from "./provider";

const IDENT_INDEX_KEY = "identities/index";
const identKey = (id: string): string => `identities/by-id/${id}`;

export const NO_PROVIDER_TO_VERIFY_WITH =
  "No email provider is configured, so nothing can confirm this address. "
  + "Choose a provider in Settings first.";

export const driverCannotVerify = (provider: ProviderKind): string =>
  `The ${provider} driver cannot confirm sender addresses, so this one stays unverified.`;

/** What `verifyDomain` reports back: the row as it now stands, plus the outcome. */
export interface IdentityVerificationOutcome {
  identity: SenderIdentity;
  verification: IdentityVerification;
}

export class IdentityService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    // Supplied by the container. Optional only so a caller constructing this
    // service directly still compiles — without them nothing can be verified,
    // and `verifyDomain` says exactly that rather than passing anything.
    private provider?: ProviderService,
    private drivers?: Map<ProviderKind, EmailDriver>,
  ) {}

  async list(): Promise<SenderIdentity[]> {
    const ids = (await this.storage.get<string[]>(IDENT_INDEX_KEY)) ?? [];
    const out: SenderIdentity[] = [];
    for (const id of ids) {
      const row = await this.storage.get<SenderIdentity>(identKey(id));
      if (row) out.push(row);
    }
    return out.sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  async get(id: string): Promise<SenderIdentity | null> {
    const row = await this.storage.get<SenderIdentity>(identKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  /**
   * The address outbound mail is stamped with when a caller supplies none.
   *
   * A provider-verified default wins. Failing that, the default identity is
   * still returned even while it is `pending` — QUEUEING is not a claim that
   * anything was delivered, and the two gates that matter are downstream and
   * truthful: `DeliveryService` refuses to send at all while the provider is
   * `none`, and a real provider refuses an unverified From with its own
   * message, which lands on the row as the failure reason. Blocking the
   * enqueue instead would only move the same refusal earlier and lose the
   * durable outbox row that makes it visible.
   *
   * The blind spot stays visible: `buildEmailSenderHealth` counts ACTIVE
   * identities, so a workspace sending from a pending default is not healthy.
   */
  async getDefault(): Promise<SenderIdentity | null> {
    const all = await this.list();
    return all.find(i => i.isDefault && i.status === "active")
      ?? all.find(i => i.isDefault && i.status !== "failed")
      ?? null;
  }

  async create(input: CreateIdentityInput, actor: UserId): Promise<SenderIdentity> {
    if (!input.name.trim()) throw new Error("Identity name required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      throw new Error("Identity email must be valid.");
    }
    const id = makeId("sid");
    const ts = now();
    // If isDefault, clear the previous default.
    if (input.isDefault) {
      const existing = await this.list();
      for (const i of existing) {
        if (i.isDefault) {
          await this.storage.set(identKey(i.id), { ...i, isDefault: false, updatedAt: ts });
        }
      }
    }
    const row: SenderIdentity = {
      id,
      agencyId: this.agencyId,
      clientId: input.clientId,
      name: input.name.trim(),
      email: input.email.trim(),
      isDefault: input.isDefault ?? false,
      status: "pending",                 // verify domain to mark active
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(identKey(id), row);
    const ix = (await this.storage.get<string[]>(IDENT_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(IDENT_INDEX_KEY, [...ix, id]);
    }
    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: input.clientId,
      actorUserId: actor,
      category: "email",
      action: "email.identity.created",
      message: `Created sender identity ${row.name} <${row.email}>.`,
      metadata: { identityId: id },
    });
    this.events.emit({ agencyId: this.agencyId }, "email.identity.created", { identityId: id });
    return row;
  }

  async update(id: string, patch: UpdateIdentityPatch, actor: UserId): Promise<SenderIdentity | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    // Closing the second door into the same lie. The identity PATCH route is
    // admin-callable, so `{ status: "active" }` would have been an unverified
    // activation with no provider involved — exactly what `verifyDomain` was
    // stopped from doing. Only evidence promotes an identity.
    if (patch.status === "active" && existing.status !== "active") {
      throw new Error(
        "An identity becomes active only when the provider confirms it. Run verification instead.",
      );
    }
    if (patch.isDefault === true && !existing.isDefault) {
      const all = await this.list();
      for (const i of all) {
        if (i.id !== id && i.isDefault) {
          await this.storage.set(identKey(i.id), { ...i, isDefault: false, updatedAt: now() });
        }
      }
    }
    const email = patch.email?.trim() ?? existing.email;
    // Evidence is about ONE address. Editing the address discards it, or the
    // row would carry a "verified" stamp earned by a different mailbox.
    const addressChanged = email.toLowerCase() !== existing.email.toLowerCase();
    const next: SenderIdentity = {
      ...existing,
      // Each editable field named, never `...patch`. The patch arrives as
      // unvalidated JSON from the route, and spreading it wrote EVERY key it
      // carried straight onto the row: `verifiedAt` and `verificationSource`
      // (a verification stamp nobody earned — the guard above blocks the
      // status but that spread walked round it), and `id`/`agencyId`/
      // `createdAt` (which would orphan the row from its own tenant check).
      name: patch.name?.trim() ?? existing.name,
      email,
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(addressChanged
        ? {
            status: "pending" as const,
            verifiedAt: undefined,
            verificationSource: undefined,
            // Nobody has asked about the NEW address yet, so the "when did we
            // last ask" stamp has to go with the rest of the evidence —
            // keeping the old one would date a check of a different mailbox.
            verificationCheckedAt: undefined,
            verificationError: "The address changed, so the previous verification no longer applies.",
          }
        : {}),
      updatedAt: now(),
    };
    await this.storage.set(identKey(id), next);
    return next;
  }

  /**
   * Ask the ACTIVE provider to confirm this sender address.
   *
   * Returns `null` when the identity does not exist. Otherwise always returns
   * the row as it now stands together with the provider's answer — a refusal
   * is a result, not an exception, because the reason is the useful part and
   * the caller has to show it.
   *
   * The identity is promoted to `active` on evidence and on nothing else.
   */
  async verifyDomain(id: string, actor: UserId): Promise<IdentityVerificationOutcome | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const cfg = await this.provider?.get();
    const kind: ProviderKind = cfg?.provider ?? "none";
    let verification: IdentityVerification;
    if (!this.provider || kind === "none") {
      verification = { verified: false, reason: NO_PROVIDER_TO_VERIFY_WITH };
    } else {
      const driver = this.drivers?.get(kind);
      if (!driver?.verifyIdentity) {
        verification = { verified: false, reason: driverCannotVerify(kind) };
      } else {
        const ctx: DriverContext = {
          agencyId: this.agencyId,
          apiKey: await this.provider._readApiKey(),
          accountToken: await this.provider._readAccountToken(),
          webhookSecret: cfg?.webhookSecret,
          ...(cfg?.smtp ? { smtp: cfg.smtp } : {}),
        };
        try {
          verification = await driver.verifyIdentity({ ctx, identity: existing });
        } catch (err) {
          verification = { verified: false, reason: err instanceof Error ? err.message : String(err) };
        }
      }
    }

    const ts = now();
    const next: SenderIdentity = verification.verified
      ? {
          ...existing,
          status: "active",
          verifiedAt: ts,
          verificationSource: kind,
          verificationCheckedAt: ts,
          verificationError: undefined,
          updatedAt: ts,
        }
      : {
          ...existing,
          // A previously earned verification is not destroyed by one failed
          // re-check, but it is never CREATED by one either.
          status: existing.status === "active" ? "active" : "pending",
          verificationCheckedAt: ts,
          verificationError: verification.reason,
          updatedAt: ts,
        };
    await this.storage.set(identKey(id), next);

    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: existing.clientId,
      actorUserId: actor,
      category: "email",
      action: verification.verified ? "email.identity.verified" : "email.identity.verify_failed",
      message: verification.verified
        ? `${existing.email} confirmed by ${kind}: ${verification.evidence}`
        : `Could not confirm ${existing.email}: ${verification.reason}`,
      metadata: { identityId: id, provider: kind, verified: verification.verified },
    });
    if (verification.verified) {
      this.events.emit({ agencyId: this.agencyId }, "email.identity.verified", { identityId: id });
    }
    return { identity: next, verification };
  }
}
