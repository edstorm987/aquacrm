import "server-only";
// Multi-step resolution plans.
//
// Plenty of alerts are not one click. Chasing an unsigned contract means
// opening it, chasing the client, then recording what came back — in three
// different places. Without a plan the operator does step one, sees the alert
// still firing, and concludes the system is broken.
//
// Every step's done-ness is DERIVED from live records on each request. A
// stored checklist drifts: tick a step, the underlying record changes, and the
// checklist now lies about the state of the business. Deriving costs a read
// and is always true.
//
// An alert with no plan here is a single-step resolution — the announcement
// bar just names the task. That is the common case and needs no ceremony.

import { getClientForAgency } from "@/server/tenants";
import type { ClientContract } from "@/lib/clients/clientContracts";
import { cleanClientPaymentPlans } from "@/lib/clients/clientPaymentPlans";
import { listPersons } from "@/server/persons";
import { getOrganisation } from "@/server/organisations";
import { listAgencyTasks } from "@/server/tasks";
import { getUserById } from "@/server/users";
import type {
  EvidenceField,
  EvidenceRecord,
  ResolutionEvidence,
} from "@/lib/inbox/resolutionEvidence";
import { getCachedBusinessIssueRadar } from "@/lib/server/radar/businessIssueRadar";
import { inspectRadarEvidenceSeries } from "@/lib/server/radar/radarEvidenceVault";
import { organisationCandidatesForPerson } from "@/server/organisations";
import { clientWorkspaceHref } from "@/lib/clients/clientWorkspace";
import type { ResolutionPlan, ResolutionStep } from "@/lib/inbox/resolutionContext";
import { completionsFor } from "@/server/completedActions";
import { stepsFor } from "@/lib/inbox/evidenceSteps";
import {
  alertAge,
  plainMeaningFor,
  resolutionKindOf,
  type ResolutionExplain,
  type ResolutionRecordLink,
} from "@/lib/inbox/resolutionExplain";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { getRequestWebsiteEnquiries } from "@/lib/server/websiteEnquiries";

/**
 * Build the plan for an alert, or null when it is a single-step job.
 *
 * `alertId` is the only input beyond agency scope, so the same plan can be
 * rebuilt from any page — the banner does not need to have been handed state
 * by whatever page the operator came from.
 */
// Async because some plans read records that live outside the portal state —
// website enquiries come from Supabase, not the aggregate.
export async function resolutionPlanFor(agencyId: string, alertId: string): Promise<ResolutionPlan | null> {
  if (alertId.startsWith("enquiry-classification:")) return classifyEnquiryPlan(agencyId, alertId);
  if (alertId.startsWith("contract-awaiting:")) return contractPlan(agencyId, alertId);
  if (alertId.startsWith("payment-plan:")) return paymentPlanPlan(agencyId, alertId);
  if (alertId.startsWith("portal-access:")) return portalAccessPlan(agencyId, alertId);
  if (alertId.startsWith("enquiry:") || alertId.startsWith("website-message:")) {
    return enquiryReplyPlan(agencyId, alertId);
  }
  return null;
}

// ─── Classify an enquiry ──────────────────────────────────────────────────
//
// Two steps when the person's company is unknown: decide what the relationship
// is, then place them at a company so the record is not an orphan.

function classifyEnquiryPlan(agencyId: string, alertId: string): ResolutionPlan | null {
  // The alert id carries the enquiry id, but the card is keyed by person, so
  // resolve through whichever person owns that enquiry.
  const enquiryId = alertId.slice("enquiry-classification:".length);
  const person = findPersonByEnquiry(agencyId, enquiryId);
  if (!person) return null;

  const cardHref = `/portal/agency/contacts/${encodeURIComponent(person.id)}`;
  const classified = person.classification !== "unclassified";
  const companyPending = !person.organisationId
    && organisationCandidatesForPerson(agencyId, person).length > 0;

  const steps: ResolutionStep[] = [
    {
      id: "classify",
      label: "Decide what this relationship is",
      href: cardHref,
      focus: "classification",
      done: classified,
    },
  ];

  // Only ask about the company when there is actually a question to answer.
  // A step that is done before you arrive is noise, not guidance.
  if (companyPending || person.organisationId) {
    steps.push({
      id: "company",
      label: "Confirm which company they belong to",
      href: cardHref,
      focus: "company",
      done: Boolean(person.organisationId),
    });
  }

  // Always returns a plan, even a single-step one: it is what tells the
  // universal banner whether the job is finished, so no page has to report
  // its own progress.
  return { alertId, title: `Sort out ${person.name ?? "this enquiry"}`, steps };
}

function findPersonByEnquiry(agencyId: string, enquiryId: string) {
  return listPersons(agencyId).find(person =>
    person.facets.enquiryIds?.includes(enquiryId)) ?? null;
}

// ─── Chase a contract ─────────────────────────────────────────────────────

function contractPlan(agencyId: string, alertId: string): ResolutionPlan | null {
  const [, clientId, contractId] = alertId.split(":");
  const client = clientId ? getClientForAgency(agencyId, clientId) : null;
  if (!client) return null;
  const contracts = (client.metadata as { contracts?: ClientContract[] } | undefined)?.contracts ?? [];
  const contract = contracts.find(entry => entry.id === contractId);
  if (!contract) return null;

  const base = clientWorkspaceHref(client.id, "relationship");
  return {
    alertId,
    title: `Get "${contract.title}" signed`,
    steps: [
      {
        id: "sent",
        label: "Send the contract to the client",
        href: base,
        focus: "contract",
        done: contract.status !== "draft" || Boolean(contract.issuedAt),
      },
      // No "chase them" step: there is no reminder timestamp on a contract to
      // derive it from, so it could never tick and would strand the operator
      // on a checklist that never completes. Steps must be observable.
      {
        id: "record",
        label: "Record what they decided",
        href: base,
        focus: "contract",
        done: Boolean(contract.acceptedAt ?? contract.declinedAt),
      },
    ],
  };
}

// ─── A missed instalment ──────────────────────────────────────────────────

function paymentPlanPlan(agencyId: string, alertId: string): ResolutionPlan | null {
  const [, clientId, planId, milestoneId] = alertId.split(":");
  const client = clientId ? getClientForAgency(agencyId, clientId) : null;
  if (!client) return null;
  const plan = cleanClientPaymentPlans(client.metadata?.clientPaymentPlans)
    .find(entry => entry.id === planId);
  const milestone = plan?.milestones.find(entry => entry.id === milestoneId);
  if (!milestone) return null;

  const paid = milestone.status === "paid";
  return {
    alertId,
    title: `Collect "${milestone.title}"`,
    steps: [
      {
        id: "chase",
        label: "Chase the client for payment",
        href: clientWorkspaceHref(client.id, "communications"),
        focus: "reply",
        done: paid || Boolean(milestone.invoicedAt),
      },
      {
        id: "record",
        label: "Record the payment when it lands",
        href: clientWorkspaceHref(client.id, "finance"),
        focus: "payment",
        done: paid,
      },
    ],
  };
}

// ─── Portal access ────────────────────────────────────────────────────────

function portalAccessPlan(agencyId: string, alertId: string): ResolutionPlan | null {
  const clientId = alertId.slice("portal-access:".length);
  const client = getClientForAgency(agencyId, clientId);
  if (!client) return null;
  const metadata = client.metadata ?? {};

  return {
    alertId,
    title: `Get ${client.name} into their portal`,
    steps: [
      {
        id: "built",
        label: "Make sure the portal is built",
        href: clientWorkspaceHref(client.id, "portal"),
        focus: "access",
        done: typeof metadata.portalBuiltAt === "number",
      },
      {
        id: "invited",
        label: "Send their access invite",
        href: clientWorkspaceHref(client.id, "portal"),
        focus: "access",
        done: typeof metadata.portalInvitedAt === "number",
      },
      {
        id: "signed-in",
        label: "Confirm they have signed in",
        href: clientWorkspaceHref(client.id, "portal"),
        focus: "access",
        done: typeof metadata.portalLastLoginAt === "number",
      },
    ],
  };
}

// ─── Explaining an alert that has no button ───────────────────────────────

/**
 * Build the "what we know" payload for an alert.
 *
 * Regenerates the alert list to find the one asked for, rather than trusting
 * anything the client passed in. The caller could otherwise hand us a title
 * and detail of its choosing, and the panel would faithfully display it.
 */
export async function resolutionExplainFor(
  agencyId: string,
  alertId: string,
  now = Date.now(),
): Promise<ResolutionExplain | null> {
  const alerts = await listOperationalAlerts(agencyId, now);
  const alert = alerts.find(entry => entry.id === alertId);
  if (!alert) return null;

  // Read what the check declared; the id table is only the fallback.
  const { clearsWhen, kind } = resolutionKindOf(alert);
  const { plainMeaning, weakEvidence } = plainMeaningFor(alert.title, alert.detail, evidenceLine(alert));
  const evidence: string[] = [alert.detail];

  evidence.push(`First seen ${alertAge(alert.occurredAt, now)} ago.`);
  evidence.push(
    alert.severity === "critical"
      ? "Raised as critical — it is already costing something."
      : alert.severity === "warning"
        ? "Raised as a warning — it will cost something if left."
        : "Raised as a notice — worth clearing, not urgent.",
  );

  const records: ResolutionRecordLink[] = [];
  if (alert.clientId && alert.clientName) {
    records.push({
      label: `${alert.clientName}'s workspace`,
      href: clientWorkspaceHref(alert.clientId, "overview"),
    });
  }
  // Strip resolution context from the record link — this is "go and look",
  // not "resolve", and re-entering the flow from here would be confusing.
  const hashIndex = alert.href.indexOf("#");
  const hash = hashIndex >= 0 ? alert.href.slice(hashIndex) : "";
  const bare = alert.href.split("?")[0].split("#")[0];
  if (bare && bare !== "/portal/agency") {
    // Bare href on purpose: this is "go and look", not "resolve". Carrying the
    // context here would restart the flow the operator is already inside.
    records.push({ label: "The record this came from", href: `${bare}${hash}` });
  }

  return {
    alertId: alert.id,
    title: alert.title,
    detail: alert.detail,
    evidence,
    kind,
    clearsWhen,
    plainMeaning,
    weakEvidence,
    records,
  };
}

/**
 * Radar-style alerts carry their figures in a separate evidence line. Pull
 * whatever numeric context the alert exposes so the plain-English translation
 * has something to work with.
 */
function evidenceLine(alert: { detail: string; title: string }): string {
  return alert.detail;
}

// ─── The records behind an alert ──────────────────────────────────────────

/**
 * Gather the actual records that tripped a check, so the operator can judge it
 * without leaving the queue.
 *
 * Built per alert family. A family with no builder returns null and the UI
 * falls back to the link — better an honest link than an empty panel implying
 * there is nothing to see.
 */
export async function resolutionEvidenceFor(
  agencyId: string,
  alertId: string,
  now = Date.now(),
): Promise<ResolutionEvidence | null> {
  if (alertId.startsWith("enquiry-classification:")) return enquiryEvidence(agencyId, alertId);
  if (alertId.startsWith("person-organisation:")) return organisationEvidence(agencyId, alertId);
  if (alertId.startsWith("task:")) return taskEvidence(agencyId, alertId, now);
  if (alertId.startsWith("payment-plan:")) return paymentEvidence(agencyId, alertId, now);
  if (alertId.startsWith("contract-awaiting:")) return contractEvidence(agencyId, alertId, now);
  // A radar item reaches here under any of three ids depending on where it
  // was surfaced: the recommendation id, the raw incident id, or an issue id.
  if (alertId.startsWith("radar:")
    || alertId.startsWith("recommended-radar:")
    || alertId.startsWith("incident:")) {
    return radarEvidenceFor(agencyId, alertId);
  }
  // Everything else still gets evidence. A family without a bespoke builder
  // used to show "no inline records", which reads as "there is nothing to see"
  // — the opposite of what an alert means. The generic builder shows what the
  // check itself knows: what fired, how long ago, how severe, what clears it,
  // and which client it concerns.
  return genericEvidenceFor(agencyId, alertId, now);
}

function enquiryEvidence(agencyId: string, alertId: string): ResolutionEvidence | null {
  const enquiryId = alertId.slice("enquiry-classification:".length);
  const person = findPersonByEnquiry(agencyId, enquiryId);
  if (!person) {
    return {
      alertId,
      summary: "The person behind this enquiry could not be found.",
      records: [],
      unavailable: "The enquiry may have been removed, or it has not been reconciled yet.",
    };
  }
  const emails = (person.emails ?? []).map(entry => entry.raw ?? entry.value);
  const phones = (person.phones ?? []).map(entry => entry.raw ?? entry.value);

  return {
    alertId,
    summary: "This is everything recorded about the person who enquired.",
    steps: stepsFor(alertId, {
      who: person.name,
      href: `/portal/agency/contacts/${encodeURIComponent(person.id)}`,
    }),
    records: [{
      id: person.id,
      label: person.name ?? emails[0] ?? "Unnamed enquirer",
      meta: person.company,
      fields: [
        { label: "Classification", value: person.classification, emphasis: person.classification === "unclassified" },
        { label: emails.length > 1 ? "Emails" : "Email", value: emails.join(", ") || "—" },
        { label: phones.length > 1 ? "Numbers" : "Number", value: phones.join(", ") || "—" },
        { label: "Role", value: person.jobTitle ?? "—" },
        { label: "Company", value: person.organisationId ? "Linked" : "Not linked" },
        { label: "Source", value: person.source ?? "—" },
      ],
      href: `/portal/agency/contacts/${encodeURIComponent(person.id)}`,
    }],
  };
}

function organisationEvidence(agencyId: string, alertId: string): ResolutionEvidence | null {
  const organisationId = alertId.slice("person-organisation:".length);
  const organisation = getOrganisation(agencyId, organisationId);
  if (!organisation) return null;

  const pending = listPersons(agencyId).filter(person =>
    organisationCandidatesForPerson(agencyId, person)
      .some(candidate => candidate.organisationId === organisationId));

  return {
    alertId,
    summary: `${pending.length} ${pending.length === 1 ? "person" : "people"} may belong to ${organisation.name}.`,
    steps: stepsFor(alertId, {
      who: organisation.name,
      href: `/portal/agency/contacts/companies/${encodeURIComponent(organisation.id)}`,
    }),
    records: pending.map(person => ({
      id: person.id,
      label: person.name ?? (person.emails ?? [])[0]?.value ?? "Unnamed",
      meta: person.jobTitle,
      fields: [
        { label: "Email", value: (person.emails ?? [])[0]?.value ?? "—" },
        {
          label: "Why suggested",
          value: organisationCandidatesForPerson(agencyId, person)
            .find(candidate => candidate.organisationId === organisationId)?.reason ?? "—",
          emphasis: true,
        },
      ],
      href: `/portal/agency/contacts/${encodeURIComponent(person.id)}`,
    })),
  };
}

function taskEvidence(agencyId: string, alertId: string, now: number): ResolutionEvidence | null {
  const taskId = alertId.slice("task:".length);
  const task = listAgencyTasks(agencyId).find(entry => entry.id === taskId);
  if (!task) return null;

  const overdueBy = task.dueAt && task.dueAt < now
    ? `${Math.floor((now - task.dueAt) / 86_400_000)} days overdue`
    : undefined;

  return {
    alertId,
    summary: "The task this alert is about.",
    steps: stepsFor(alertId, {
      href: `/portal/agency/actions#task-${encodeURIComponent(task.id)}`,
    }),
    records: [{
      id: task.id,
      label: task.title,
      meta: overdueBy,
      fields: [
        { label: "Status", value: task.status },
        { label: "Priority", value: task.priority ?? "normal" },
        { label: "Due", value: task.dueAt ? new Date(task.dueAt).toLocaleDateString("en-GB") : "—", emphasis: Boolean(overdueBy) },
        { label: "Owner", value: task.assigneeUserId ? getUserById(task.assigneeUserId)?.name ?? "Assigned" : "Unassigned", emphasis: !task.assigneeUserId },
        { label: "Notes", value: task.notes?.slice(0, 240) || "—" },
      ],
      href: `/portal/agency/actions#task-${encodeURIComponent(task.id)}`,
    }],
  };
}

function paymentEvidence(agencyId: string, alertId: string, now: number): ResolutionEvidence | null {
  const [, clientId, planId, milestoneId] = alertId.split(":");
  const client = clientId ? getClientForAgency(agencyId, clientId) : null;
  if (!client) return null;
  const plan = cleanClientPaymentPlans(client.metadata?.clientPaymentPlans).find(entry => entry.id === planId);
  const milestone = plan?.milestones.find(entry => entry.id === milestoneId);
  if (!milestone) return null;

  const lateBy = milestone.dueAt < now ? `${Math.floor((now - milestone.dueAt) / 86_400_000)} days late` : undefined;
  return {
    alertId,
    summary: `An instalment on ${client.name}'s payment plan.`,
    steps: stepsFor(alertId, {
      who: client.name,
      amount: `£${(milestone.amountCents / 100).toFixed(2)}`,
      href: clientWorkspaceHref(client.id, "finance"),
    }),
    records: [{
      id: milestone.id,
      label: milestone.title,
      meta: lateBy,
      fields: [
        { label: "Amount", value: `£${(milestone.amountCents / 100).toFixed(2)}`, emphasis: true },
        { label: "Due", value: new Date(milestone.dueAt).toLocaleDateString("en-GB"), emphasis: Boolean(lateBy) },
        { label: "Status", value: milestone.status },
        { label: "Invoice", value: milestone.invoiceNumber ?? "Not invoiced" },
      ],
      href: clientWorkspaceHref(client.id, "finance"),
    }],
  };
}

function contractEvidence(agencyId: string, alertId: string, now: number): ResolutionEvidence | null {
  const [, clientId, contractId] = alertId.split(":");
  const client = clientId ? getClientForAgency(agencyId, clientId) : null;
  if (!client) return null;
  const contracts = (client.metadata as { contracts?: ClientContract[] } | undefined)?.contracts ?? [];
  const contract = contracts.find(entry => entry.id === contractId);
  if (!contract) return null;

  const waiting = contract.issuedAt
    ? `${Math.floor((now - contract.issuedAt) / 86_400_000)} days since it was sent`
    : "Not sent yet";
  return {
    alertId,
    summary: `A contract with ${client.name}.`,
    steps: stepsFor(alertId, { who: client.name, href: clientWorkspaceHref(client.id, "relationship") }),
    records: [{
      id: contract.id,
      label: contract.title,
      meta: waiting,
      fields: [
        { label: "Status", value: contract.status, emphasis: contract.status === "draft" },
        { label: "Sent", value: contract.issuedAt ? new Date(contract.issuedAt).toLocaleDateString("en-GB") : "—" },
        { label: "Decision", value: contract.acceptedAt ? "Accepted" : contract.declinedAt ? "Declined" : "None yet", emphasis: !contract.acceptedAt && !contract.declinedAt },
        { label: "Version", value: String(contract.version ?? 1) },
      ],
      href: clientWorkspaceHref(client.id, "relationship"),
    }],
  };
}

// ─── Radar: the numbers behind a deviation ────────────────────────────────

/**
 * Evidence for a Radar issue: the KPI, its history, and what it is measured
 * against.
 *
 * Radar alerts are the ones most in need of this. "Broke its historical
 * pattern — 99 robust deviations from its retained median" is unreadable, and
 * unreadable alerts get ignored. The same information as a line against its
 * median is obvious in a second, including when the movement is trivial.
 */
export async function radarEvidenceFor(
  agencyId: string,
  alertId: string,
): Promise<ResolutionEvidence | null> {
  const radar = await getCachedBusinessIssueRadar(agencyId).catch(() => null);
  if (!radar) return null;

  // The alert id carries the incident it came from, however it was wrapped.
  const incidentId = alertId
    .replace(/^recommended-radar:/, "")
    .replace(/^radar:/, "");
  const incident = radar.incidents.find(entry =>
    entry.id === incidentId || entry.issueIds.includes(incidentId));
  if (!incident) return null;

  const records: EvidenceRecord[] = [];

  // One record per check behind the incident, so a grouped alert shows every
  // measurement that contributed rather than an aggregate nobody can trace.
  for (const checkId of incident.checkIds.slice(0, 6)) {
    const check = radar.checks?.find(entry => entry.id === checkId);
    if (!check) continue;

    const inspection = inspectRadarEvidenceSeries(agencyId, check.sourceId);
    const points = (inspection?.points ?? []).slice(-48);
    const values = points.map(point => point.value);
    const median = values.length ? medianOf(values) : undefined;

    const fields: EvidenceField[] = [
      { label: "Now", value: formatNumber(check.value), emphasis: true },
      { label: "Usually", value: median !== undefined ? formatNumber(median) : "—" },
      { label: "Previously", value: formatNumber(check.previousValue) },
      { label: "Samples", value: String(check.historySamples ?? check.sampleSize ?? points.length) },
      { label: "Better when", value: check.expectedDirection ?? "—" },
      { label: "Measured", value: new Date(check.measuredAt).toLocaleString("en-GB") },
    ];

    // Say plainly when the history is too thin to conclude anything from.
    if (points.length < 5) {
      fields.push({
        label: "Confidence",
        value: `Only ${points.length} reading${points.length === 1 ? "" : "s"} retained — too few to call this a pattern.`,
        emphasis: true,
      });
    }

    records.push({
      id: check.id,
      label: check.title,
      meta: check.familyLabel,
      fields,
      href: check.href,
      series: points.length >= 2
        ? {
            label: check.title,
            points,
            median,
            expectedDirection: check.expectedDirection,
          }
        : undefined,
    });
  }

  if (!records.length) {
    return {
      alertId,
      summary: incident.title,
      records: [],
      unavailable: "Radar has not retained enough readings for this check to show its history yet.",
    };
  }

  return {
    alertId,
    summary: `${records.length} measurement${records.length === 1 ? "" : "s"} behind "${incident.title}".`,
    records,
    steps: stepsFor(alertId),
  };
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}


// ─── Evidence for a family with no bespoke builder ────────────────────────

/**
 * The alert's own facts, rendered as a record.
 *
 * Deliberately not "nothing to show": every alert knows why it fired, when,
 * how severe it is and what will clear it. Presenting that beats an empty
 * panel, and it means pressing Evidence is never a wasted click — which is
 * what teaches an operator to stop pressing it.
 */
async function genericEvidenceFor(
  agencyId: string,
  alertId: string,
  now: number,
): Promise<ResolutionEvidence | null> {
  const alerts = await listOperationalAlerts(agencyId, now);
  const alert = alerts.find(entry => entry.id === alertId);
  if (!alert) return null;

  const { kind, clearsWhen } = resolutionKindOf(alert);
  const fields: EvidenceField[] = [
    { label: "What fired", value: alert.detail },
    { label: "Severity", value: alert.severity, emphasis: alert.severity === "critical" },
    { label: "First seen", value: `${alertAge(alert.occurredAt, now)} ago` },
    { label: "Area", value: alert.category },
    {
      label: "How it is dealt with",
      value: kind === "in-app"
        ? "There is a control in Aqua that resolves this."
        : kind === "off-system"
          ? "The work happens outside Aqua; record the outcome here."
          : "A judgement call — nothing to press.",
    },
  ];
  if (clearsWhen) fields.push({ label: "Clears when", value: clearsWhen, emphasis: true });

  // Anything already done against this alert, so a repeat is recognisable.
  const previously = completionsFor(agencyId, alert.id);
  if (previously.length) {
    fields.push({
      label: "Dealt with before",
      value: `${previously.length} time${previously.length === 1 ? "" : "s"}, most recently ${
        new Date(previously[0].completedAt).toLocaleString("en-GB")
      }`,
      emphasis: true,
    });
  }

  // Pull the client's actual contact details so a step can say "ring Sarah on
  // 0161…" rather than "chase the client". The number being three fields away
  // from the instruction is the difference between knowing and doing.
  const client = alert.clientId ? getClientForAgency(agencyId, alert.clientId) : null;
  const clientMeta = (client?.metadata ?? {}) as Record<string, unknown>;
  const contact = [clientMeta.phone, clientMeta.contactPhone, clientMeta.clientEmail, client?.ownerEmail]
    .find(value => typeof value === "string" && value.trim()) as string | undefined;

  if (client) {
    fields.push({ label: "Client", value: client.name });
    if (contact) fields.push({ label: "Reach them on", value: contact, emphasis: true });
  }

  return {
    alertId,
    summary: alert.clientName
      ? `What Aqua knows about this, for ${alert.clientName}.`
      : "What Aqua knows about this.",
    steps: stepsFor(alert.id, {
      who: client?.name ?? alert.clientName,
      contact,
      href: alert.href,
    }),
    records: [{
      id: alert.id,
      label: alert.title,
      meta: alert.clientName,
      fields,
      href: alert.href.split("?")[0].split("#")[0] || undefined,
    }],
  };
}


// ─── Answering an enquiry ─────────────────────────────────────────────────

/**
 * Read, reply, close. Three genuinely separate milestones, each with its own
 * timestamp on the enquiry — so progress is observable rather than asserted.
 *
 * Worth a plan because the middle step is the one that gets skipped: an
 * enquiry marked resolved without a reply looks handled in Aqua and ignored to
 * the person who sent it.
 */
async function enquiryReplyPlan(agencyId: string, alertId: string): Promise<ResolutionPlan | null> {
  const enquiryId = alertId.slice(alertId.indexOf(":") + 1);
  const enquiries = await getRequestWebsiteEnquiries(agencyId).catch(() => []);
  const enquiry = enquiries.find(entry => entry.id === enquiryId);
  if (!enquiry) return null;

  const href = `/portal/agency/inbox?view=all&form=${encodeURIComponent(enquiry.id)}`;
  return {
    alertId,
    title: `Answer ${enquiry.name || "this enquiry"}`,
    steps: [
      {
        id: "read",
        label: "Read what they sent",
        href,
        focus: "reply",
        done: Boolean(enquiry.reviewedAt),
      },
      {
        id: "reply",
        label: "Reply to them",
        href,
        focus: "reply",
        // Replies are recorded on the enquiry, so this is real evidence that
        // somebody was actually answered.
        done: Boolean(enquiry.firstRespondedAt || enquiry.replies.length),
      },
      {
        id: "close",
        label: "Mark it handled",
        href,
        focus: "reply",
        done: enquiry.status === "resolved" || Boolean(enquiry.resolvedAt),
      },
    ],
  };
}
