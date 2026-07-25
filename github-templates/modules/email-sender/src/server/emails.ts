// EmailService — public entry point + idempotent enqueue + state
// machine + cross-plugin event subscribers.
//
// Storage:
//   email/by-id/<id>            → EmailMessage
//   email/idem/<key>            → IdempotencyEntry  (collapse re-enqueue)
//   email/by-status/<status>    → string[] of message ids per status
//   email/index                 → string[] of all message ids

import { fnv1a, makeId } from "../lib/ids";
import { now } from "../lib/time";
import type { AgencyId, ClientId, PluginId, UserId } from "../lib/tenancy";
import type {
  EmailFrom,
  EmailMessage,
  EmailStatus,
  EnqueueInput,
  IdempotencyEntry,
  MessageFilter,
} from "../lib/domain";
import type {
  ActivityLogPort,
  EventBusPort,
  MarketingTemplatePort,
  StoragePort,
} from "./ports";
import type { IdentityService } from "./identities";

const MSG_INDEX_KEY = "email/index";
const msgKey = (id: string): string => `email/by-id/${id}`;
const idemKey = (k: string): string => `email/idem/${k}`;
const byStatusKey = (s: EmailStatus): string => `email/by-status/${s}`;

export class EmailService {
  constructor(
    private agencyId: AgencyId,
    private storage: StoragePort,
    private activity: ActivityLogPort,
    private events: EventBusPort,
    private identities: IdentityService,
    private marketingTemplates?: MarketingTemplatePort,
  ) {}

  async list(filter?: MessageFilter): Promise<EmailMessage[]> {
    const ids = filter?.status
      ? ((await this.storage.get<string[]>(byStatusKey(filter.status))) ?? [])
      : ((await this.storage.get<string[]>(MSG_INDEX_KEY)) ?? []);
    const out: EmailMessage[] = [];
    for (const id of ids) {
      const row = await this.storage.get<EmailMessage>(msgKey(id));
      if (row) out.push(row);
    }
    return out
      .filter(m => !filter?.triggeredByPlugin || m.triggeredByPlugin === filter.triggeredByPlugin)
      .filter(m => !filter?.fromCreatedAt || m.createdAt >= filter.fromCreatedAt)
      .filter(m => !filter?.toCreatedAt || m.createdAt <= filter.toCreatedAt)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async get(id: string): Promise<EmailMessage | null> {
    const row = await this.storage.get<EmailMessage>(msgKey(id));
    return row && row.agencyId === this.agencyId ? row : null;
  }

  async getByExternalRef(externalRef: string): Promise<EmailMessage | null> {
    const ids = (await this.storage.get<string[]>(MSG_INDEX_KEY)) ?? [];
    for (const id of ids) {
      const row = await this.storage.get<EmailMessage>(msgKey(id));
      if (row && row.externalRef === externalRef) return row;
    }
    return null;
  }

  // ─── Enqueue ────────────────────────────────────────────────────────────
  //
  // Public entry point. Validates; resolves template if templateId set
  // (cross-reads from agency-marketing via injected port); collapses
  // duplicate enqueues on (triggeredByPlugin, externalRef-or-payloadHash);
  // returns the queued EmailMessage.

  async enqueue(input: EnqueueInput, actor: UserId = "system"): Promise<EmailMessage> {
    const to = Array.isArray(input.to) ? input.to : [input.to];
    if (to.length === 0) throw new Error("Email needs at least one recipient.");
    for (const r of to) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)) {
        throw new Error(`Invalid recipient email: ${r}`);
      }
    }

    let subject = input.subject;
    let bodyHtml = input.bodyHtml;
    let bodyText = input.bodyText;

    if (input.templateId) {
      if (!this.marketingTemplates) {
        throw new Error("templateId provided but agency-marketing not installed (MarketingTemplatePort absent).");
      }
      const tpl = await this.marketingTemplates.getTemplate({
        agencyId: this.agencyId,
        templateId: input.templateId,
      });
      if (!tpl) throw new Error(`Template ${input.templateId} not found.`);
      const vars = input.templateValues ?? {};
      if (this.marketingTemplates.render) {
        const r = await this.marketingTemplates.render({
          agencyId: this.agencyId,
          template: tpl,
          vars,
        });
        subject = subject ?? r.subject;
        bodyHtml = bodyHtml ?? r.html;
        bodyText = bodyText ?? r.text;
      } else {
        // Fallback: do the substitution locally with the same {{key}}
        // syntax agency-marketing uses.
        subject = subject ?? substitute(tpl.subject, vars);
        bodyHtml = bodyHtml ?? substitute(tpl.bodyHtml, vars);
        bodyText = bodyText ?? (tpl.bodyText ? substitute(tpl.bodyText, vars) : undefined);
      }
    }

    if (!subject) throw new Error("Subject required (or set templateId).");
    if (!bodyHtml && !bodyText) throw new Error("Email needs bodyHtml or bodyText.");

    // Resolve `from`: caller-provided wins; else default identity.
    let from = input.from;
    if (!from) {
      const def = await this.identities.getDefault();
      if (!def) throw new Error("No default sender identity. Configure one in Settings.");
      from = { name: def.name, email: def.email };
    }

    // Idempotency: caller-supplied externalRef + triggeredByPlugin
    // is the canonical key. Without externalRef, fall back to a hash
    // of the payload (still collapses identical duplicate enqueues
    // from event-bus retries).
    const idemValue = computeIdempotencyKey({
      triggeredByPlugin: input.triggeredByPlugin,
      externalRef: input.externalRef,
      to, subject, bodyHtml, bodyText,
    });
    const prior = await this.storage.get<IdempotencyEntry>(idemKey(idemValue));
    if (prior) {
      const priorMsg = await this.get(prior.messageId);
      if (priorMsg) return priorMsg;
    }

    const id = makeId("msg");
    const ts = now();
    const message: EmailMessage = {
      id,
      agencyId: this.agencyId,
      clientId: input.clientId,
      to,
      cc: arrayOrUndefined(input.cc),
      bcc: arrayOrUndefined(input.bcc),
      from,
      replyTo: input.replyTo,
      subject,
      bodyHtml,
      bodyText,
      templateId: input.templateId,
      templateValues: input.templateValues,
      attachments: input.attachments,
      status: "queued",
      scheduledFor: input.scheduledFor,
      triggeredByPlugin: input.triggeredByPlugin,
      idempotencyKey: idemValue,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.storage.set(msgKey(id), message);
    await this.appendToStatusIndex(id, "queued");
    await this.appendToIndex(id);
    await this.storage.set(idemKey(idemValue), {
      messageId: id,
      triggeredByPlugin: input.triggeredByPlugin,
      externalRef: input.externalRef,
      createdAt: ts,
    } satisfies IdempotencyEntry);

    await this.activity.logActivity({
      agencyId: this.agencyId,
      clientId: input.clientId,
      actorUserId: actor,
      category: "email",
      action: "email.queued",
      message: `Queued email "${subject}" → ${to.join(", ")}${input.triggeredByPlugin ? ` (via ${input.triggeredByPlugin})` : ""}.`,
      metadata: { messageId: id, templateId: input.templateId, triggeredByPlugin: input.triggeredByPlugin },
    });
    this.events.emit({ agencyId: this.agencyId, clientId: input.clientId }, "email.queued", { messageId: id });
    return message;
  }

  // ─── State transitions ────────────────────────────────────────────────

  async markSending(id: string): Promise<EmailMessage | null> {
    return this.transition(id, "queued", "sending");
  }

  async markSent(id: string, externalRef: string): Promise<EmailMessage | null> {
    const updated = await this.transition(id, ["queued", "sending"], "sent", { externalRef, sentAt: now() });
    if (updated) {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: updated.clientId,
        category: "email",
        action: "email.sent",
        message: `Sent email "${updated.subject}" → ${updated.to.join(", ")} (ref ${externalRef}).`,
        metadata: { messageId: id, externalRef },
      });
      this.events.emit(
        { agencyId: this.agencyId, clientId: updated.clientId },
        "email.sent",
        { messageId: id, externalRef },
      );
    }
    return updated;
  }

  async markFailed(id: string, reason: string): Promise<EmailMessage | null> {
    const updated = await this.transition(id, ["queued", "sending"], "failed", { failureReason: reason });
    if (updated) {
      await this.activity.logActivity({
        agencyId: this.agencyId,
        clientId: updated.clientId,
        category: "email",
        action: "email.failed",
        message: `Email send failed: ${reason}`,
        metadata: { messageId: id, reason },
      });
      this.events.emit(
        { agencyId: this.agencyId, clientId: updated.clientId },
        "email.failed",
        { messageId: id, reason },
      );
    }
    return updated;
  }

  async markBounced(id: string, reason?: string): Promise<EmailMessage | null> {
    const updated = await this.transition(id, ["sent", "failed"], "bounced", { failureReason: reason });
    if (updated) {
      this.events.emit(
        { agencyId: this.agencyId, clientId: updated.clientId },
        "email.bounced",
        { messageId: id, reason },
      );
    }
    return updated;
  }

  // Reset a failed/bounced message back to queued so the
  // DeliveryService can re-attempt. Public so the retry handler +
  // OutboxPage button can call without piercing internals.
  async resetForRetry(id: string): Promise<EmailMessage | null> {
    return this.transition(id, ["failed", "bounced"], "queued", { failureReason: undefined });
  }

  // ─── Cross-plugin event subscribers ───────────────────────────────────
  //
  // Foundation's event router (T1 R6) calls these by method name when
  // the matching event fires for any agency that has email-sender
  // installed. Each subscriber composes an EnqueueInput from the event
  // payload and calls this.enqueue. Idempotency keys derived from the
  // source event id keep retries collapsed.

  async onFormsNotificationRequested(payload: {
    submissionId: string;
    formId: string;
    formName: string;
    notifyEmails?: string[];
    payload: Record<string, unknown>;
  }): Promise<EmailMessage | null> {
    if (!payload.notifyEmails || payload.notifyEmails.length === 0) return null;
    return this.enqueue({
      to: payload.notifyEmails,
      subject: `New submission on ${payload.formName}`,
      bodyText: `New submission on form ${payload.formName} (id ${payload.submissionId}).\n\n` +
        `Submission payload:\n${JSON.stringify(payload.payload, null, 2)}`,
      triggeredByPlugin: "forms",
      externalRef: payload.submissionId,
    });
  }

  async onMembershipSubscriptionChanged(payload: {
    subscriptionId: string;
    userId: string;
    userEmail?: string;
    oldStatus: string;
    newStatus: string;
    planName?: string;
  }): Promise<EmailMessage | null> {
    if (!payload.userEmail) return null;
    const isWelcome = payload.newStatus === "active" && payload.oldStatus !== "active";
    const isCancel = payload.newStatus === "canceled";
    if (!isWelcome && !isCancel) return null;
    return this.enqueue({
      to: payload.userEmail,
      subject: isWelcome
        ? `Welcome to ${payload.planName ?? "your membership"}`
        : `Your subscription has been canceled`,
      bodyText: isWelcome
        ? `Thanks for joining! Your ${payload.planName ?? "membership"} is now active.`
        : `Your subscription has been canceled. We'd love to have you back.`,
      triggeredByPlugin: "memberships",
      externalRef: `${payload.subscriptionId}:${payload.newStatus}`,
    });
  }

  async onAffiliatePayoutCompleted(payload: {
    payoutId: string;
    affiliateUserId: string;
    affiliateEmail?: string;
    amountCents: number;
    externalRef?: string;
  }): Promise<EmailMessage | null> {
    if (!payload.affiliateEmail) return null;
    return this.enqueue({
      to: payload.affiliateEmail,
      subject: `Affiliate payout completed`,
      bodyText: `Your payout of ${(payload.amountCents / 100).toFixed(2)} has been sent` +
        `${payload.externalRef ? ` (ref ${payload.externalRef})` : ""}.`,
      triggeredByPlugin: "affiliates",
      externalRef: payload.payoutId,
    });
  }

  async onAuthBootstrapSignup(payload: {
    userId: string;
    email: string;
    name?: string;
    agencyName?: string;
  }): Promise<EmailMessage | null> {
    return this.enqueue({
      to: payload.email,
      subject: `Welcome${payload.agencyName ? ` to ${payload.agencyName}` : ""}`,
      bodyText: `Hi ${payload.name ?? "there"},\n\nYour account is ready. Sign in any time to manage your profile.`,
      triggeredByPlugin: "auth",
      externalRef: payload.userId,
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────

  private async transition(
    id: string,
    fromStatus: EmailStatus | EmailStatus[],
    toStatus: EmailStatus,
    extra: Partial<EmailMessage> = {},
  ): Promise<EmailMessage | null> {
    const existing = await this.get(id);
    if (!existing) return null;
    const allowed = Array.isArray(fromStatus) ? fromStatus : [fromStatus];
    if (!allowed.includes(existing.status)) return existing;
    const next: EmailMessage = {
      ...existing,
      ...extra,
      status: toStatus,
      updatedAt: now(),
    };
    await this.storage.set(msgKey(id), next);
    await this.removeFromStatusIndex(id, existing.status);
    await this.appendToStatusIndex(id, toStatus);
    return next;
  }

  private async appendToStatusIndex(id: string, status: EmailStatus): Promise<void> {
    const ix = (await this.storage.get<string[]>(byStatusKey(status))) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(byStatusKey(status), [...ix, id]);
    }
  }

  private async removeFromStatusIndex(id: string, status: EmailStatus): Promise<void> {
    const ix = (await this.storage.get<string[]>(byStatusKey(status))) ?? [];
    await this.storage.set(byStatusKey(status), ix.filter(x => x !== id));
  }

  private async appendToIndex(id: string): Promise<void> {
    const ix = (await this.storage.get<string[]>(MSG_INDEX_KEY)) ?? [];
    if (!ix.includes(id)) {
      await this.storage.set(MSG_INDEX_KEY, [...ix, id]);
    }
  }
}

// ─── Module-level helpers ────────────────────────────────────────────────

function arrayOrUndefined(v: string | string[] | undefined): string[] | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v : [v];
}

function substitute(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    return vars[key] !== undefined ? vars[key]! : `{{${key}}}`;
  });
}

function computeIdempotencyKey(args: {
  triggeredByPlugin?: PluginId;
  externalRef?: string;
  to: string[];
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
}): string {
  const trigger = args.triggeredByPlugin ?? "manual";
  if (args.externalRef) return `${trigger}:${args.externalRef}`;
  const sortedTo = [...args.to].sort().join(",");
  const bodyHash = fnv1a(`${args.subject ?? ""}|${args.bodyHtml ?? ""}|${args.bodyText ?? ""}`);
  return `${trigger}:${sortedTo}:${bodyHash}`;
}
