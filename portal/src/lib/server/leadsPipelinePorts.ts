import "server-only";
// T1 R037 — port adapters for `@aqua/plugin-leads-pipeline` (T2 R027).
//
// Two ports:
//   • EmailEnqueuePort  — wraps `@aqua/plugin-email-sender`'s
//     `EmailService.enqueue` so the leads-pipeline campaign sender
//     never imports email-sender directly. `triggeredByPlugin` +
//     `externalRef` forwarded verbatim for idempotency. Default
//     identity comes from email-sender's IdentityService when the
//     caller doesn't set `from`.
//
//   • PipelinePort — wraps T1 R034 `pipelines.ts`. Looks up the
//     leads-kind pipeline via `getPipelineBySlug(agencyId, "leads")`
//     and adds / queries lead cards. Returns null when no leads
//     pipeline has been seeded yet (graceful: the LeadService still
//     persists the row, just without a card).
//
// Both ports are wired into `registerLeadsPipelineFoundation({...})`
// from the side-effect adapter file in `src/plugins/foundation-adapters/`.
// Email-sender is not yet registered in the foundation registry as of
// R037 — when it is missing, `enqueue()` throws a clear "foundation
// pending" error so callers can degrade gracefully (the leads-pipeline
// CampaignService catches and persists a `failed` outbox row).

import {
  addCard,
  deleteCard,
  getPipelineBySlug,
  listCardsByAgency,
} from "@/server/pipelines";
import type {
  EmailEnqueueInput,
  EmailEnqueueResult,
  EmailEnqueuePort,
  PipelinePort,
  PipelineCardRef,
  AddLeadCardInput,
} from "@aqua/plugin-leads-pipeline/server";

// ─── EmailEnqueuePort (adapter onto @aqua/plugin-email-sender) ────────────

export const emailEnqueuePort: EmailEnqueuePort = {
  async enqueue(input: EmailEnqueueInput): Promise<EmailEnqueueResult> {
    // Lazy + dynamic import so a missing email-sender package doesn't
    // bomb the foundation boot path. The leads-pipeline plugin only
    // calls `enqueue()` at campaign-send time, so the failure stays
    // scoped to the actual send attempt (foundation-pending).
    //
    // Email-sender is NOT yet in `_registry.ts` as of T1 R037 —
    // adding it is a separate round (next foundation-pending note).
    // Until then `enqueue()` throws a clear "foundation pending" error
    // so the leads-pipeline CampaignService can persist a `failed`
    // outbox row gracefully.
    let sender: {
      isFoundationRegistered: () => boolean;
      containerFor: (args: {
        agencyId: string;
        storage: unknown;
        install?: unknown;
      }) => { emails: { enqueue: (i: unknown) => Promise<{ id: string }> } };
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sender = (await import("@aqua/plugin-email-sender/server" as any)) as never;
    } catch {
      throw new Error(
        "[leads-pipeline.emailEnqueuePort] @aqua/plugin-email-sender not installed in the workspace (foundation-pending).",
      );
    }
    if (!sender.isFoundationRegistered()) {
      throw new Error(
        "[leads-pipeline.emailEnqueuePort] email-sender foundation not registered (foundation-pending).",
      );
    }
    const { makePluginStorage } = await import("@/lib/server/pluginStorage");
    const { getInstall } = await import("@/server/pluginInstalls");
    const install = getInstall({ agencyId: input.agencyId }, "email-sender");
    if (!install) {
      throw new Error(
        "[leads-pipeline.emailEnqueuePort] email-sender not installed for agency " +
          `${input.agencyId}.`,
      );
    }
    const storage = makePluginStorage(install.id);
    const container = sender.containerFor({
      agencyId: input.agencyId,
      storage,
      install,
    });
    const message = await container.emails.enqueue({
      to: input.to,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      triggeredByPlugin: input.triggeredByPlugin,
      externalRef: input.externalRef,
    });
    return { messageId: message.id };
  },
  async send(input: EmailEnqueueInput): Promise<EmailEnqueueResult> {
    const sender = await import("@aqua/plugin-email-sender/server" as never) as {
      isFoundationRegistered: () => boolean;
      containerFor: (args: { agencyId: string; storage: unknown; install?: unknown }) => {
        emails: { enqueue: (i: unknown) => Promise<{ id: string }> };
        delivery: { deliver: (id: string) => Promise<{ ok: boolean; reason?: string }> };
      };
    };
    if (!sender.isFoundationRegistered()) throw new Error("Email sender is not configured.");
    const { makePluginStorage } = await import("@/lib/server/pluginStorage");
    const { getInstall } = await import("@/server/pluginInstalls");
    const install = getInstall({ agencyId: input.agencyId }, "email-sender");
    if (!install) throw new Error("Install Email sender before sending proposals.");
    const container = sender.containerFor({
      agencyId: input.agencyId,
      storage: makePluginStorage(install.id),
      install,
    });
    const message = await container.emails.enqueue({
      to: input.to,
      subject: input.subject,
      bodyHtml: input.bodyHtml,
      bodyText: input.bodyText,
      triggeredByPlugin: input.triggeredByPlugin,
      externalRef: input.externalRef,
    });
    const delivered = await container.delivery.deliver(message.id);
    return { messageId: message.id, delivered: delivered.ok, error: delivered.reason };
  },
};

// ─── PipelinePort (adapter onto T1 R034 foundation pipelines) ────────────

const LEADS_PIPELINE_SLUG = "leads";
const DEFAULT_NEW_COLUMN_ID = "new";

export const pipelinePort: PipelinePort = {
  addLeadCard(input: AddLeadCardInput): PipelineCardRef | null {
    const pipeline = getPipelineBySlug(input.agencyId, LEADS_PIPELINE_SLUG);
    if (!pipeline) return null;
    // An override is honoured only if the column actually exists. Restore passes
    // the column the card sat in before archiving, and a pipeline that has since
    // been re-columned would otherwise take the card to a column id nothing
    // renders — a card that exists and cannot be seen, which is the exact shape
    // of the bug this whole change is closing.
    const requested = input.columnId
      ? pipeline.columns.find(c => c.id === input.columnId)?.id
      : undefined;
    const columnId = requested
      ?? pipeline.columns.find(c => c.label === "New")?.id
      ?? pipeline.columns.find(c => c.id === DEFAULT_NEW_COLUMN_ID)?.id
      ?? pipeline.columns[0]?.id
      ?? DEFAULT_NEW_COLUMN_ID;
    const card = addCard(input.agencyId, pipeline.id, {
      kind: "lead",
      columnId,
      // Stamp `leadId` onto the snapshot so card-move handlers can
      // resolve back to the originating Lead row. The foundation
      // LeadSnapshot shape is permissive; extra fields are preserved.
      lead: {
        email: input.email,
        phone: input.phone,
        name: input.name,
        source: input.source,
        capturedAt: Date.now(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ leadId: input.leadId } as any),
      },
    });
    if (!card) return null;
    return { cardId: card.id, pipelineId: pipeline.id, columnId: card.columnId };
  },

  leadIdsInColumn(args: { agencyId: string; columnLabel: string }): string[] {
    const pipeline = getPipelineBySlug(args.agencyId, LEADS_PIPELINE_SLUG);
    if (!pipeline) return [];
    const column = pipeline.columns.find(c => c.label === args.columnLabel || c.id === args.columnLabel);
    if (!column) return [];
    const cards = listCardsByAgency(args.agencyId);
    const out: string[] = [];
    for (const c of cards) {
      if (c.kind !== "lead") continue;
      if (c.pipelineId !== pipeline.id) continue;
      if (c.columnId !== column.id) continue;
      const leadId = (c.lead as unknown as { leadId?: string }).leadId;
      if (leadId) out.push(leadId);
    }
    return out;
  },

  columnIdForLead(args: { agencyId: string; leadId: string }): string | null {
    const pipeline = getPipelineBySlug(args.agencyId, LEADS_PIPELINE_SLUG);
    if (!pipeline) return null;
    for (const c of listCardsByAgency(args.agencyId)) {
      if (c.kind !== "lead" || c.pipelineId !== pipeline.id) continue;
      if ((c.lead as unknown as { leadId?: string }).leadId === args.leadId) return c.columnId;
    }
    return null;
  },

  removeLeadCards(args: { agencyId: string; leadId: string; cardId?: string }): number {
    let removed = 0;
    // The stored id first — it is the only handle when the card has drifted to
    // another pipeline — then a sweep by `leadId`, because `pipelineCardId` is
    // absent on every lead captured while the foundation was unwired.
    if (args.cardId && deleteCard(args.agencyId, args.cardId)) removed += 1;
    for (const card of listCardsByAgency(args.agencyId)) {
      if (card.kind !== "lead") continue;
      if ((card.lead as unknown as { leadId?: string }).leadId !== args.leadId) continue;
      if (deleteCard(args.agencyId, card.id)) removed += 1;
    }
    return removed;
  },

  columnLabelForLead(args: { agencyId: string; leadId: string }): string | null {
    const pipeline = getPipelineBySlug(args.agencyId, LEADS_PIPELINE_SLUG);
    if (!pipeline) return null;
    const cards = listCardsByAgency(args.agencyId);
    for (const c of cards) {
      if (c.kind !== "lead") continue;
      if (c.pipelineId !== pipeline.id) continue;
      const lid = (c.lead as unknown as { leadId?: string }).leadId;
      if (lid === args.leadId) {
        return pipeline.columns.find(col => col.id === c.columnId)?.label ?? null;
      }
    }
    return null;
  },
};
