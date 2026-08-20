import "server-only";

import { createHash } from "node:crypto";

import type { EditAdapter, EditDocument, EditPlan, EditTarget } from "@/engines/editor/editing/engine";
import { getPortalEditorState, savePortalEditorField } from "@/server/portalEditor";
import { ensureAgencyWebsite, updateAgencyWebsitePage } from "@/server/agencyWebsite";
import { getClientForAgency, updateClient } from "@/server/tenants";
import type { PortalFormEntity } from "@/server/types";

/**
 * Aqua's existing editors, moved onto the shared loop.
 *
 * None of them checked for a concurrent edit. `savePortalEditorField` and
 * `updateAgencyWebsitePage` both read the current state, apply a change and
 * write it back, so two people editing one thing meant the second silently
 * erased the first — and because the write succeeded, nothing anywhere said
 * so. Each editor was missing the same protection because each had its own
 * copy of the same loop.
 *
 * An adapter is now the whole of what a surface writes. Conflict detection,
 * all-or-nothing publishing, dry runs and the explicit-confirmation rule
 * belong to the engine, so a new editor cannot ship without them.
 */

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex").slice(0, 16);
}

/**
 * The fields on a portal form.
 *
 * The revision is the state's `updatedAt`. Any change to any field moves it,
 * which is the right granularity here because the fields are stored and
 * written back as a single document.
 */
export function portalFormEditAdapter(input: {
  agencyId: string;
  entity: PortalFormEntity;
  actorUserId: string;
}): EditAdapter {
  const read = () => getPortalEditorState(input.agencyId);

  return {
    async map(): Promise<EditDocument> {
      const state = read();
      const fields = state.forms[input.entity] ?? [];
      const targets: EditTarget[] = fields.map(field => ({
        id: field.id,
        label: field.label,
        kind: "direct",
        value: field.label,
        fingerprint: fingerprint(field),
      }));
      return {
        id: `portal-form:${input.agencyId}:${input.entity}`,
        label: `${input.entity} form`,
        revision: String(state.updatedAt),
        targets,
      };
    },

    async currentRevision(): Promise<string> {
      return String(read().updatedAt);
    },

    async publish(plan: EditPlan) {
      const fields = read().forms[input.entity] ?? [];
      for (const change of plan.changes) {
        const existing = fields.find(field => field.id === change.target.id);
        if (!existing) continue;
        savePortalEditorField(input.agencyId, input.entity, { ...existing, label: change.after }, input.actorUserId);
      }
      return {
        revision: String(read().updatedAt),
        summary: `Updated ${plan.changes.length} field${plan.changes.length === 1 ? "" : "s"} on the ${input.entity} form.`,
      };
    },
  };
}

/**
 * The agency website's pages.
 *
 * `status` is deliberately not an edit target. It is a workflow state moved by
 * deploys and telemetry rather than typed by a person, so listing it beside
 * editable copy would invite somebody to "fix" a status that the next deploy
 * immediately overwrites.
 */
export function agencyWebsiteEditAdapter(input: {
  agencyId: string;
  actorUserId: string;
}): EditAdapter {
  const read = () => ensureAgencyWebsite(input.agencyId);

  return {
    async map(): Promise<EditDocument> {
      const project = read();
      const targets: EditTarget[] = project.pages.map(page => ({
        id: page.route,
        label: `${page.label} (${page.route})`,
        kind: "direct",
        value: page.message ?? "",
        fingerprint: fingerprint({ message: page.message ?? "", updatedAt: page.updatedAt }),
      }));
      return {
        id: `agency-website:${input.agencyId}`,
        label: "Agency website",
        revision: String(project.updatedAt),
        targets,
      };
    },

    async currentRevision(): Promise<string> {
      return String(read().updatedAt);
    },

    async publish(plan: EditPlan) {
      const project = read();
      for (const change of plan.changes) {
        const page = project.pages.find(entry => entry.route === change.target.id);
        if (!page) continue;
        updateAgencyWebsitePage(input.agencyId, page.route, { status: page.status, message: change.after }, input.actorUserId);
      }
      return {
        revision: String(read().updatedAt),
        summary: `Updated ${plan.changes.length} page${plan.changes.length === 1 ? "" : "s"} on the agency website.`,
      };
    },
  };
}

/**
 * A client's customer-portal copy.
 *
 * The largest of the three by field count and the one where losing an edit
 * costs most: this is the text a client reads when they log in. It saved
 * through `updateClient`, which merges metadata and keeps whichever write
 * arrived last — so two people preparing a portal quietly overwrote each
 * other, exactly as the form editor did.
 *
 * Each field is its own target rather than the metadata blob being one. Two
 * people editing different fields of the same portal is ordinary and should
 * not conflict; only editing the *same* field should.
 */
const PORTAL_FIELDS: Array<{ key: string; label: string }> = [
  { key: "portalContactName", label: "Main contact" },
  { key: "portalServicePlan", label: "Service plan" },
  { key: "portalPlanSummary", label: "Plan summary" },
  { key: "portalExperienceHeadline", label: "Welcome headline" },
  { key: "portalBillingCadence", label: "Billing cadence" },
  { key: "portalWelcomeNote", label: "Welcome note" },
  { key: "portalSupportEmail", label: "Support email" },
  { key: "portalSupportPhone", label: "Support phone" },
];

export function clientPortalEditAdapter(input: {
  agencyId: string;
  clientId: string;
  /**
   * Accepted for parity with the other adapters. `updateClient` does not take
   * an actor, so attribution for portal copy lives in the activity log the
   * caller writes rather than here.
   */
  actorUserId?: string;
}): EditAdapter {
  const read = () => getClientForAgency(input.agencyId, input.clientId);

  return {
    async map(): Promise<EditDocument> {
      const client = read();
      const metadata = (client?.metadata ?? {}) as Record<string, unknown>;
      const targets: EditTarget[] = PORTAL_FIELDS.map(field => {
        const value = typeof metadata[field.key] === "string" ? metadata[field.key] as string : "";
        return {
          id: field.key,
          label: field.label,
          kind: "direct",
          value,
          fingerprint: fingerprint(value),
        };
      });
      return {
        id: `client-portal:${input.clientId}`,
        label: client ? `${client.name} portal` : "Client portal",
        revision: String(client?.updatedAt ?? 0),
        targets,
      };
    },

    async currentRevision(): Promise<string> {
      return String(read()?.updatedAt ?? 0);
    },

    async publish(plan: EditPlan) {
      // One write for the whole plan. Saving field by field would leave a
      // portal half-updated if anything failed midway, which a client would
      // see before we did.
      const metadata = Object.fromEntries(plan.changes.map(change => [change.target.id, change.after]));
      updateClient(input.agencyId, input.clientId, { metadata });
      return {
        revision: String(read()?.updatedAt ?? 0),
        summary: `Updated ${plan.changes.length} field${plan.changes.length === 1 ? "" : "s"} on the client portal.`,
      };
    },
  };
}
