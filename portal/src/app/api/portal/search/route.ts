import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth";
import { ensureDefaultAgencyProducts, listAgencyProducts } from "@/server/agencyProducts";
import { listClients } from "@/server/tenants";
import { getState, ensureHydrated } from "@/server/storage";
import { listAgencyTasks } from "@/server/tasks";
import { listSops } from "@/server/sops";
import { listUsersForAgency } from "@/server/users";
import { AGENCY_ROLES } from "@/server/types";
import { listLegalDocuments } from "@/server/legalDocuments";
import { listVisibleDevelopmentResources } from "@/server/developmentToolkit";
import type { Role } from "@/server/types";
import { listOperationalAlerts } from "@/lib/server/operationalAlerts";

export interface GlobalSearchResult {
  id: string;
  category:
    | "Company"
    | "Client"
    | "Client data"
    | "Contact"
    | "Lead"
    | "Product"
    | "Task"
    | "SOP"
    | "Staff"
    | "Invoice"
    | "Expense"
    | "Income"
    | "Milestone"
    | "Client care"
    | "Request"
    | "Resource"
    | "Knowledge"
    | "Note"
    | "Message"
    | "Meeting"
    | "Contract"
    | "File"
    | "Form"
    | "Activity"
    | "Assistant"
    | "Workflow"
    | "Experiment"
    | "Website"
    | "Notification";
  title: string;
  subtitle?: string;
  href: string;
}

type Candidate = GlobalSearchResult & { searchText: string };

export async function GET(request: Request) {
  try {
    await ensureHydrated();
    const session = await requireRole([...AGENCY_ROLES]);
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120) ?? "";
    if (!query) return NextResponse.json({ ok: true, results: [] });

    ensureDefaultAgencyProducts(session.agencyId);
    const candidates = await buildCandidates(session.agencyId, session.userId, session.role);
    const results = candidates
      .map(candidate => ({ candidate, score: score(candidate, query) }))
      .filter(match => match.score > 0)
      .sort((left, right) => right.score - left.score || left.candidate.title.localeCompare(right.candidate.title))
      .slice(0, 40)
      .map(({ candidate: { searchText: _searchText, ...result } }) => result);

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return authErrorResponse(error);
  }
}

async function buildCandidates(agencyId: string, userId: string, role: Role): Promise<Candidate[]> {
  const state = getState();
  const clients = listClients(agencyId, { includeArchived: true });
  const clientById = new Map(clients.map(client => [client.id, client]));
  const candidates: Candidate[] = [];
  const company = state.companyProfiles[agencyId];

  push(candidates, {
    id: `company:${agencyId}`,
    category: "Company",
    title: "Company",
    subtitle: "Mission, objectives, targets, plans and quarterly reviews",
    href: "/portal/agency/company",
  }, company ? [
    company.mission,
    company.vision,
    company.values.join(" "),
    company.objectives.map(item => `${item.title} ${item.metric}`).join(" "),
    company.plans.map(item => `${item.title} ${item.notes ?? ""}`).join(" "),
    company.reviews.map(item => `${item.period} ${item.wins} ${item.lessons} ${item.decisions} ${item.nextPriorities}`).join(" "),
  ] : []);

  for (const document of listLegalDocuments(agencyId)) {
    push(candidates, {
      id: document.id,
      category: "Company",
      title: document.title,
      subtitle: [readable(document.category), document.counterparty, document.reference, readable(document.status)].filter(Boolean).join(" · "),
      href: "/portal/agency/company#legal",
    }, [document.notes, document.fileName]);
  }

  for (const client of clients) {
    const metadata = client.metadata ?? {};
    const businessName = text(metadata.businessName);
    const contactName = text(metadata.contactName);
    push(candidates, {
      id: client.id,
      category: "Client",
      title: client.name,
      subtitle: [businessName && businessName !== client.name ? businessName : "", client.ownerEmail, readable(client.stage)].filter(Boolean).join(" · "),
      href: `/portal/clients/${client.id}`,
    }, [client.slug, client.websiteUrl, text(metadata.leadSource), text(metadata.portalServicePlan), safeSerialise(metadata)]);

    const linkedContacts = Array.isArray(metadata.linkedContacts) ? metadata.linkedContacts : [];
    for (const value of linkedContacts) {
      if (!isRecord(value)) continue;
      const name = text(value.name);
      if (!name) continue;
      push(candidates, {
        id: `${client.id}:${text(value.id) || name}`,
        category: "Contact",
        title: name,
        subtitle: [text(value.role), client.name, text(value.email), text(value.phone)].filter(Boolean).join(" · "),
        href: `/portal/clients/${client.id}?tab=overview`,
      });
    }
    if (contactName && !linkedContacts.some(value => isRecord(value) && text(value.name) === contactName)) {
      push(candidates, {
        id: `${client.id}:primary`,
        category: "Contact",
        title: contactName,
        subtitle: [client.name, client.ownerEmail].filter(Boolean).join(" · "),
        href: `/portal/clients/${client.id}?tab=overview`,
      });
    }

    addNestedClientCandidates(candidates, client.id, client.name, metadata);

    const requests = Array.isArray(metadata.clientRequests) ? metadata.clientRequests : [];
    for (const value of requests) {
      if (!isRecord(value)) continue;
      const message = text(value.message);
      const type = text(value.type) || "request";
      push(candidates, {
        id: `${client.id}:${text(value.id) || message}`,
        category: "Request",
        title: `${readable(type)} · ${client.name}`,
        subtitle: [readable(text(value.status) || "open"), message.slice(0, 100)].filter(Boolean).join(" · "),
        href: `/portal/clients/${client.id}?tab=overview`,
      }, [text(value.link), text(value.submittedBy)]);
    }
  }

  for (const product of listAgencyProducts(agencyId, true)) {
    push(candidates, {
      id: product.id,
      category: "Product",
      title: product.name,
      subtitle: [product.category, priceLabel(product.priceCents, product.pricing, product.billingInterval), product.active ? "" : "Archived"].filter(Boolean).join(" · "),
      href: `/portal/agency/products/${product.id}`,
    }, [product.description, product.buyerHeadline, product.internalInfo, product.deliverables.join(" "), product.contractTitle]);
  }

  for (const task of listAgencyTasks(agencyId)) {
    push(candidates, {
      id: task.id,
      category: "Task",
      title: task.title,
      subtitle: [readable(task.status), task.priority, task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString("en-GB")}` : ""].filter(Boolean).join(" · "),
      href: `/portal/agency/actions?task=${encodeURIComponent(task.id)}`,
    }, [task.notes, task.recurrence]);
  }

  for (const sop of listSops(agencyId)) {
    push(candidates, {
      id: sop.id,
      category: "SOP",
      title: sop.title,
      subtitle: [sop.category, sop.kind === "file" ? sop.fileName : "Written guide"].filter(Boolean).join(" · "),
      href: `/portal/agency/sop-library?sop=${encodeURIComponent(sop.id)}`,
    }, [sop.content, sop.tags.join(" ")]);
  }

  for (const resource of listVisibleDevelopmentResources(agencyId, userId, role)) {
    const knowledge = ["course", "knowledge", "credential", "sop"].includes(resource.kind);
    push(candidates, {
      id: resource.id,
      category: knowledge ? "Knowledge" : "Resource",
      title: resource.title,
      subtitle: [readable(resource.kind), resource.category, resource.visibility === "private" ? "Private" : ""].filter(Boolean).join(" · "),
      href: knowledge ? "/portal/agency/development/vault" : "/portal/agency/development/toolkit",
    }, [resource.description, resource.url, resource.localPath, resource.tags.join(" "), resource.credential?.username]);
  }

  for (const user of listUsersForAgency(agencyId)) {
    push(candidates, {
      id: user.id,
      category: "Staff",
      title: user.name || user.email,
      subtitle: [user.email, readable(user.role)].filter(Boolean).join(" · "),
      href: `/portal/clients?view=staff&user=${encodeURIComponent(user.id)}`,
    }, [user.username]);
  }

  const pipelineById = new Map(Object.values(state.pipelines).filter(pipeline => pipeline.agencyId === agencyId).map(pipeline => [pipeline.id, pipeline]));
  for (const card of Object.values(state.pipelineCards)) {
    const pipeline = pipelineById.get(card.pipelineId);
    if (!pipeline) continue;
    if (card.kind === "lead") {
      push(candidates, {
        id: card.id,
        category: "Lead",
        title: card.lead.name || card.lead.email,
        subtitle: [card.lead.email, card.lead.phone, card.lead.source, pipeline.name].filter(Boolean).join(" · "),
        href: `/portal/agency/pipelines/${pipeline.slug}?card=${encodeURIComponent(card.id)}`,
      });
    } else if (card.kind === "deal") {
      push(candidates, {
        id: card.id,
        category: "Lead",
        title: card.deal.title,
        subtitle: [card.deal.contactEmail, pipeline.name].filter(Boolean).join(" · "),
        href: `/portal/agency/pipelines/${pipeline.slug}?card=${encodeURIComponent(card.id)}`,
      });
    }
  }

  for (const milestone of Object.values(state.clientMilestones)) {
    if (milestone.agencyId !== agencyId) continue;
    const client = clientById.get(milestone.clientId);
    push(candidates, {
      id: milestone.id,
      category: "Milestone",
      title: milestone.title,
      subtitle: [client?.name, readable(milestone.status), `${milestone.progress}%`].filter(Boolean).join(" · "),
      href: client ? `/portal/clients/${client.id}` : "/portal/agency/performance",
    }, [milestone.description]);
  }

  for (const care of Object.values(state.clientDelight)) {
    if (care.agencyId !== agencyId) continue;
    push(candidates, {
      id: care.id,
      category: "Client care",
      title: care.title,
      subtitle: [care.recipientName, readable(care.occasion), readable(care.status)].filter(Boolean).join(" · "),
      href: `/portal/agency/you-deserve-it?item=${encodeURIComponent(care.id)}`,
    }, [care.notes, care.supplier]);
  }

  addFinanceCandidates(candidates, state, agencyId, clientById);
  addWorkspaceCandidates(candidates, state, agencyId, userId, clientById);
  addPluginCandidates(candidates, state, agencyId, clientById);
  for (const alert of await listOperationalAlerts(agencyId)) {
    push(candidates, {
      id: `notification:${alert.id}`,
      category: "Notification",
      title: alert.title,
      subtitle: [alert.detail, alert.clientName, readable(alert.category), readable(alert.severity)].filter(Boolean).join(" · "),
      href: alert.href,
    }, ["alert", "notification", "needs attention", alert.category, alert.severity]);
  }
  return candidates;
}

function addNestedClientCandidates(
  candidates: Candidate[],
  clientId: string,
  clientName: string,
  metadata: Record<string, unknown>,
) {
  const seen = new Set<string>();
  for (const leaf of collectTextLeaves(metadata, [], 500)) {
    if (!isMeaningfulLeaf(leaf.path, leaf.value)) continue;
    const category = categoryForPath(leaf.path);
    if (category === "Client data" && leaf.value.length < 4) continue;
    const dedupe = `${category}:${leaf.path.join(".")}:${leaf.value}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const field = readable([...leaf.path].reverse().find(segment => !/^\d+$/.test(segment)) || "information");
    push(candidates, {
      id: `${clientId}:data:${seen.size}`,
      category,
      title: `${field} · ${clientName}`,
      subtitle: snippet(leaf.value),
      href: `/portal/clients/${clientId}`,
    }, [clientName, leaf.path.join(" "), leaf.value]);
  }
}

function addWorkspaceCandidates(
  candidates: Candidate[],
  state: ReturnType<typeof getState>,
  agencyId: string,
  userId: string,
  clientById: Map<string, ReturnType<typeof listClients>[number]>,
) {
  for (const entry of state.activity) {
    if (entry.agencyId !== agencyId) continue;
    const client = entry.clientId ? clientById.get(entry.clientId) : undefined;
    push(candidates, {
      id: entry.id,
      category: "Activity",
      title: entry.message || readable(entry.action),
      subtitle: [client?.name, readable(entry.category), readable(entry.action)].filter(Boolean).join(" · "),
      href: entry.clientId ? `/portal/clients/${entry.clientId}` : "/portal/agency/settings#logs",
    }, [entry.actorEmail, safeSerialise(entry.metadata)]);
  }

  const assistant = state.assistant?.[`${agencyId}|${userId}`];
  for (const thread of assistant?.threads ?? []) {
    for (const message of thread.messages) {
      push(candidates, {
        id: message.id,
        category: "Assistant",
        title: thread.title || "Assistant conversation",
        subtitle: snippet(message.content),
        href: "/portal/agency/assistant",
      }, [message.content, message.role]);
    }
  }
  for (const memory of assistant?.memories ?? []) {
    push(candidates, {
      id: memory.id,
      category: "Assistant",
      title: "Assistant memory",
      subtitle: snippet(memory.content),
      href: "/portal/agency/assistant",
    }, [memory.content]);
  }

  for (const workflow of Object.values(state.developmentWorkflows)) {
    if (workflow.agencyId !== agencyId) continue;
    push(candidates, {
      id: workflow.id,
      category: "Workflow",
      title: workflow.name,
      subtitle: [workflow.productCategory, workflow.active ? "Active" : "Inactive"].filter(Boolean).join(" · "),
      href: "/portal/agency/development/workflow",
    }, [workflow.description, workflow.stages.map(stage => `${stage.name} ${stage.description ?? ""}`).join(" ")]);
  }

  for (const experiment of Object.values(state.performanceExperiments)) {
    if (experiment.agencyId !== agencyId) continue;
    const client = experiment.clientId ? clientById.get(experiment.clientId) : undefined;
    push(candidates, {
      id: experiment.id,
      category: "Experiment",
      title: experiment.name,
      subtitle: [client?.name ?? "Milesymedia", readable(experiment.status), experiment.primaryMetric].filter(Boolean).join(" · "),
      href: "/portal/agency/performance",
    }, [experiment.hypothesis, experiment.variants.map(variant => variant.name).join(" ")]);
  }

  const website = state.agencyWebsites[agencyId];
  if (website) {
    push(candidates, {
      id: `website:${agencyId}`,
      category: "Website",
      title: website.name,
      subtitle: [readable(website.status), website.productionUrl].filter(Boolean).join(" · "),
      href: "/portal/agency/development/website",
    }, [website.gateHeadline, website.gateMessage, website.maintenanceMessage, website.previewUrl, website.repositoryUrl, website.localPath]);
    for (const page of website.pages) {
      push(candidates, {
        id: `website:${agencyId}:${page.route}`,
        category: "Website",
        title: page.label,
        subtitle: [page.route, readable(page.status), page.message].filter(Boolean).join(" · "),
        href: "/portal/agency/development/website",
      });
    }
    for (const event of website.telemetryEvents.slice(-500)) {
      const searchable = [event.message, event.query, event.formName, event.path, event.title].filter(Boolean).join(" ");
      if (!searchable) continue;
      push(candidates, {
        id: event.id,
        category: event.type === "form" ? "Form" : "Website",
        title: event.formName || event.query || event.title || readable(event.type),
        subtitle: [event.path, event.message].filter(Boolean).join(" · "),
        href: "/portal/agency/performance",
      }, [searchable]);
    }
  }

  const editor = state.portalEditor[agencyId];
  for (const [entity, fields] of Object.entries(editor?.forms ?? {})) {
    for (const field of fields ?? []) {
      push(candidates, {
        id: `field:${entity}:${field.id}`,
        category: "Form",
        title: field.label,
        subtitle: `${readable(entity)} · ${readable(field.section)} · ${readable(field.type)}`,
        href: "/portal/agency/settings#portal-editor",
      }, [field.options.join(" ")]);
    }
  }
}

function addPluginCandidates(
  candidates: Candidate[],
  state: ReturnType<typeof getState>,
  agencyId: string,
  clientById: Map<string, ReturnType<typeof listClients>[number]>,
) {
  const installs = Object.values(state.pluginInstalls).filter(install => install.agencyId === agencyId);
  for (const install of installs) {
    const records = state.pluginData[install.id] ?? {};
    for (const [key, value] of Object.entries(records)) {
      if (key.endsWith("/index") || !isRecord(value)) continue;
      if (install.pluginId === "agency-finance" && /^(invoices|expenses|income)\/by-id\//.test(key)) continue;
      const leaves = collectTextLeaves(value, [], 200);
      const searchable = leaves.map(leaf => leaf.value).join(" ");
      if (!searchable) continue;
      const category = categoryForPath([install.pluginId, key, ...leaves.flatMap(leaf => leaf.path)]);
      const clientId = text(value.clientId) || install.clientId || "";
      const client = clientById.get(clientId);
      const title = firstText(value, ["title", "subject", "name", "label", "number", "email", "message"])
        || readable(key.split("/").at(-1) || install.pluginId);
      push(candidates, {
        id: `${install.id}:${key}`,
        category,
        title,
        subtitle: [client?.name, readable(install.pluginId), snippet(firstText(value, ["message", "notes", "description", "content", "body"]))].filter(Boolean).join(" · "),
        href: pluginHref(install.pluginId, clientId),
      }, [key, safeSerialise(value)]);
    }
  }
}

function addFinanceCandidates(candidates: Candidate[], state: ReturnType<typeof getState>, agencyId: string, clientById: Map<string, ReturnType<typeof listClients>[number]>) {
  const financeInstallIds = Object.values(state.pluginInstalls)
    .filter(install => install.agencyId === agencyId && install.pluginId === "agency-finance")
    .map(install => install.id);
  for (const installId of financeInstallIds) {
    const records = state.pluginData[installId] ?? {};
    for (const [key, value] of Object.entries(records)) {
      if (!isRecord(value)) continue;
      if (key.startsWith("invoices/by-id/")) {
        const id = text(value.id);
        push(candidates, {
          id,
          category: "Invoice",
          title: text(value.number) || "Invoice",
          subtitle: [clientById.get(text(value.clientId))?.name, readable(text(value.status)), money(value.totalCents, text(value.currency))].filter(Boolean).join(" · "),
          href: `/portal/agency/agency-finance/invoices/${id}`,
        }, [text(value.notes), text(value.reference)]);
      } else if (key.startsWith("expenses/by-id/")) {
        const id = text(value.id);
        push(candidates, {
          id,
          category: "Expense",
          title: text(value.vendor) || text(value.description) || "Expense",
          subtitle: [money(value.amountCents, text(value.currency)), clientById.get(text(value.clientId))?.name, readable(text(value.status))].filter(Boolean).join(" · "),
          href: `/portal/agency/agency-finance/expenses?expense=${encodeURIComponent(id)}`,
        }, [text(value.description), text(value.reason), text(value.reference)]);
      } else if (key.startsWith("income/by-id/")) {
        const id = text(value.id);
        push(candidates, {
          id,
          category: "Income",
          title: text(value.title) || "Income",
          subtitle: [money(value.amountCents, text(value.currency)), clientById.get(text(value.clientId))?.name, text(value.category)].filter(Boolean).join(" · "),
          href: `/portal/agency/agency-finance/income?entry=${encodeURIComponent(id)}`,
        }, [text(value.description), text(value.notes), text(value.reference)]);
      }
    }
  }
}

function push(candidates: Candidate[], result: GlobalSearchResult, extra: Array<unknown> = []) {
  candidates.push({
    ...result,
    searchText: [result.title, result.subtitle, ...extra.map(text)].filter(Boolean).join(" ").toLowerCase(),
  });
}

function score(candidate: Candidate, query: string): number {
  const normalised = normalise(query);
  const title = normalise(candidate.title);
  if (title === normalised) return 140;
  if (title.startsWith(normalised)) return 120;
  if (title.includes(normalised)) return 100;
  const terms = normalised.split(/\s+/).filter(Boolean);
  const primaryWords = normalise(`${candidate.title} ${candidate.subtitle ?? ""}`).split(/[^a-z0-9]+/).filter(Boolean);
  if (terms.every(term => term.length <= 2
    ? primaryWords.some(word => word.startsWith(term))
    : normalise(candidate.searchText).includes(term))) return 70 + terms.length;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeSerialise(value: unknown): string {
  try {
    return JSON.stringify(redact(value)).slice(0, 50_000);
  } catch {
    return "";
  }
}

const SENSITIVE_KEY = /(password|secret|token|api[-_]?key|authorization|cookie|credential|encrypted|hash|nonce)/i;

function redact(value: unknown, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map(item => redact(item));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  return value;
}

interface TextLeaf {
  path: string[];
  value: string;
}

function collectTextLeaves(value: unknown, path: string[], limit: number, output: TextLeaf[] = []): TextLeaf[] {
  if (output.length >= limit) return output;
  if (typeof value === "string") {
    const clean = value.trim();
    if (clean && !path.some(segment => SENSITIVE_KEY.test(segment))) output.push({ path, value: clean });
    return output;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length && output.length < limit; index += 1) {
      collectTextLeaves(value[index], [...path, String(index + 1)], limit, output);
    }
    return output;
  }
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (output.length >= limit || SENSITIVE_KEY.test(key)) continue;
      collectTextLeaves(child, [...path, key], limit, output);
    }
  }
  return output;
}

function isMeaningfulLeaf(path: string[], value: string): boolean {
  const key = path.at(-1) ?? "";
  if (/^(id|createdAt|updatedAt|submittedAt|occurredAt|receivedAt|sortOrder)$/i.test(key)) return false;
  if (/^(true|false|null|undefined)$/i.test(value)) return false;
  return true;
}

function categoryForPath(path: string[]): GlobalSearchResult["category"] {
  const value = path.join(" ").toLowerCase();
  if (/(message|reply|conversation|inbox|chat)/.test(value)) return "Message";
  if (/(meeting|session|call|recording|presentation)/.test(value)) return "Meeting";
  if (/(contract|agreement|sla)/.test(value)) return "Contract";
  if (/(file|attachment|upload|document|asset|pdf)/.test(value)) return "File";
  if (/(form|response|submission|questionnaire)/.test(value)) return "Form";
  if (/(note|comment|feedback|problem|solution|inspiration|brief)/.test(value)) return "Note";
  if (/(lead|prospect|scout)/.test(value)) return "Lead";
  return "Client data";
}

function firstText(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const found = text(value[key]);
    if (found) return found;
  }
  return "";
}

function pluginHref(pluginId: string, clientId: string): string {
  if (clientId) return `/portal/clients/${clientId}`;
  if (pluginId === "agency-finance") return "/portal/agency/agency-finance";
  if (pluginId === "agency-marketing") return "/portal/agency/marketing";
  if (pluginId === "leads-pipeline") return "/portal/agency/pipelines/leads";
  if (pluginId === "email-sender") return "/portal/agency/inbox";
  if (pluginId === "fulfillment") return "/portal/agency/pipelines/fulfilment";
  return "/portal/agency";
}

function snippet(value: string, length = 140): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1)}…` : clean;
}

function normalise(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}@._:/-]+/gu, " ").trim();
}

function readable(value: string): string {
  return value.replace(/^aqua-/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function money(value: unknown, currency: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency?.toUpperCase() || "GBP" }).format(value / 100);
}

function priceLabel(value: number | undefined, pricing: string, interval: string | undefined): string {
  if (pricing === "custom" || value === undefined) return "Custom quote";
  const amount = money(value, "GBP");
  if (pricing === "from") return `From ${amount}`;
  if (pricing === "recurring") return `${amount} / ${interval ?? "month"}`;
  return amount;
}
