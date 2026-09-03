import { NextResponse } from "next/server";

import { authErrorResponse, requireRole } from "@/lib/server/auth/auth";
import { searchCandidateAccess, type SearchCandidateAccess } from "@/lib/server/access/searchCandidateAccess";
import { agencyProductsForRead, listAgencyProducts } from "@/server/agencyProducts";
import { listClients } from "@/server/tenants";
import { getState, ensureHydrated } from "@/server/storage";
import { getActiveDataRealmId } from "@/server/dataRealm";
import { AccessControlError, accessErrorResponse, requireCurrentAccessActor } from "@/server/accessControl";
import { listAgencyTasks } from "@/server/tasks";
import { listSops } from "@/engines/sop/server/sops";
import { listUsersForAgency } from "@/server/users";
import { AGENCY_ROLES } from "@/server/types";
import { listLegalDocuments } from "@/server/legalDocuments";
import { getCompanyProfile } from "@/server/company";
import { listVisibleDevelopmentResources } from "@/server/developmentToolkit";
import type { Role } from "@/server/types";
import { listOperationalAlerts } from "@/lib/server/inbox/operationalAlerts";
import { listNotepadFolders, listNotepadNotes } from "@/server/notepad";
import { listWebsiteEnquiries, type WebsiteEnquiry } from "@/lib/server/websiteEnquiries";
import { listInboxSnapshot } from "@/lib/server/inbox/inboxStore";
import type { InboxSnapshot } from "@/lib/inbox/types";
import type { BusinessIssueRadar, RadarEvidenceInspectionIndex } from "@/engines/data/radar/businessRadar";
import type { CommandIntelligenceSnapshot } from "@/lib/intelligence/commandIntelligence";
import { getCachedBusinessIssueRadar } from "@/engines/data/server/radar/businessIssueRadar";
import { buildCommandIntelligenceSnapshot } from "@/lib/server/commandIntelligenceService";
import { inspectRadarEvidence } from "@/engines/data/server/radar/radarEvidenceVault";
import { listRadarSourceSearchDatasetsForActor, type RadarSourceSearchDataset } from "@/engines/data/server/radar/radarSourceInspection";
import { listPeopleApplications, listPeopleEmployees, listPeopleLeaveRequests, listPeopleTraining } from "@/server/people";
import { cleanClientMarketingService } from "@/lib/clients/clientMarketingService";
import { getInstall } from "@/server/pluginInstalls";
import { makePluginStorage } from "@/lib/server/pluginStorage";
import { ensureLeadsPipelineFoundationRegistered } from "@/built-ins/runtime/foundation-adapters/leadsPipelineFoundation";
import { containerFor as leadsContainerFor } from "@aqua/plugin-leads-pipeline/server";
import { formatUkDate } from "@/lib/shared/formatDateTime";
import { cleanClientPaymentPlans, paymentPlanPaid, paymentPlanTotal } from "@/lib/clients/clientPaymentPlans";
import { clientRelationshipId } from "@/server/clientRelationships";

export interface GlobalSearchResult {
  id: string;
  category:
    | "Executive"
    | "Company"
    | "Client"
    | "Client data"
    | "Contact"
    | "Lead"
    | "Enquiry"
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
    | "Notification"
    | "KPI"
    | "Radar"
    | "Check"
    | "Evidence"
    | "Source"
    | "Campaign"
    | "Audience"
    | "Data";
  title: string;
  subtitle?: string;
  excerpt?: string;
  matchedOn?: string;
  timestamp?: number;
  href: string;
}

type Candidate = GlobalSearchResult & {
  searchText: string;
  detailText: string;
  matchLabel: string;
};

interface CandidateOptions {
  detail?: string;
  matchLabel?: string;
  timestamp?: number;
}

const SEARCH_INDEX_TTL_MS = 15_000;
const candidateCache = new Map<string, { expiresAt: number; promise: Promise<Candidate[]> }>();

export async function GET(request: Request) {
  try {
    // Realm selection happens synchronously inside ensureHydrated(). Capture
    // it before the first await so this request owns one unambiguous cache key.
    const hydration = ensureHydrated();
    const realmId = getActiveDataRealmId();
    await hydration;
    const session = await requireRole([...AGENCY_ROLES]);
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim().slice(0, 120) ?? "";
    const warm = url.searchParams.get("warm") === "1";
    if (!query && !warm) return NextResponse.json({ ok: true, results: [] });

    const actor = await requireCurrentAccessActor();
    const agencyId = actor.resourceAgencyId;
    if (!session.publicShowcase) agencyProductsForRead(agencyId);
    const access = searchCandidateAccess(actor);
    const candidates = await cachedCandidates(
      realmId,
      agencyId,
      session.userId,
      session.role,
      Boolean(session.publicShowcase),
      access,
      actor,
    );
    if (warm) return NextResponse.json({ ok: true, warmed: true, indexed: candidates.length, categories: categoryCounts(candidates) });
    const matches = candidates
      .map(candidate => ({ candidate, score: score(candidate, query) }))
      .filter(match => match.score > 0)
      .sort((left, right) => right.score - left.score
        || (right.candidate.timestamp ?? 0) - (left.candidate.timestamp ?? 0)
        || left.candidate.title.localeCompare(right.candidate.title));
    const results = matches
      .slice(0, 60)
      .map(({ candidate }) => {
        const { searchText: _searchText, detailText, matchLabel, ...result } = candidate;
        return {
          ...result,
          excerpt: contextualSnippet(detailText || result.subtitle || result.title, query),
          matchedOn: matchLabel,
        };
      });

    const categories = results.reduce<Record<string, number>>((counts, result) => {
      counts[result.category] = (counts[result.category] ?? 0) + 1;
      return counts;
    }, {});

    return NextResponse.json({ ok: true, results, total: matches.length, showing: results.length, indexed: candidates.length, categories });
  } catch (error) {
    if (error instanceof AccessControlError) return accessErrorResponse(error);
    return authErrorResponse(error);
  }
}

async function cachedCandidates(
  realmId: string,
  agencyId: string,
  userId: string,
  role: Role,
  isolatedShowcase: boolean,
  access: SearchCandidateAccess,
  actor: Awaited<ReturnType<typeof requireCurrentAccessActor>>,
): Promise<Candidate[]> {
  const key = `${realmId}:${agencyId}:${userId}:${role}:${isolatedShowcase ? "isolated" : "live"}:${access?.fingerprint ?? "full"}`;
  const current = candidateCache.get(key);
  if (current && current.expiresAt > Date.now()) return current.promise;
  // The historical index serialises large, polymorphic stores. It remains
  // available to owners and genuinely unmigrated managers, but a canonical
  // role must never rely on category/path guesses to redact nested fields.
  // Its index is assembled only from records whose owning element is known
  // before any searchable text is added.
  const promise = (access.fullAccess
    ? buildCandidates(agencyId, userId, role, isolatedShowcase, access, actor)
    : buildGovernedCandidates(agencyId, userId, access, actor))
    .then(candidates => candidates.filter(candidate => access.visible(candidate)))
    .catch(error => {
      candidateCache.delete(key);
      throw error;
    });
  candidateCache.set(key, { expiresAt: Date.now() + SEARCH_INDEX_TTL_MS, promise });
  return promise;
}

async function buildGovernedCandidates(
  agencyId: string,
  userId: string,
  access: SearchCandidateAccess,
  actor: Awaited<ReturnType<typeof requireCurrentAccessActor>>,
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  push(candidates, {
    id: `my-radar:${userId}`,
    category: "Radar",
    title: "My Radar",
    subtitle: "My actions, goals, wellbeing and work pace",
    href: "/portal/agency/my-radar",
  }, ["personal actions to do wellbeing goals progress"]);

  for (const client of listClients(agencyId, { includeArchived: true })) {
    // A workspace name is the minimum identity needed to choose a workspace.
    // No metadata, owner email, commercial value or hidden-tab field enters
    // this governed candidate.
    push(candidates, {
      id: client.id,
      category: "Client",
      title: client.workspaceLabel?.trim() || client.name,
      subtitle: "Client workspace",
      href: `/portal/clients/${client.id}`,
    }, [client.name, client.workspaceLabel]);
  }

  for (const task of listAgencyTasks(agencyId)) {
    if (!access.taskVisible(task)) continue;
    push(candidates, {
      id: task.id,
      category: "Task",
      title: task.title,
      subtitle: [readable(task.status), task.priority, task.dueAt ? `Due ${formatUkDate(task.dueAt, { dateStyle: "medium" })}` : ""].filter(Boolean).join(" · "),
      href: `/portal/agency/actions?task=${encodeURIComponent(task.id)}`,
    }, [task.notes, task.recurrence]);
  }

  // People records for a seat whose Staff element allows them. The same rows
  // the full index carries, gated here by the element rather than by role, so a
  // canonical `staff.people` grant can find a colleague, a candidate, a leave
  // request or a training record without the full-access index — and a seat
  // without it never sees the loop run. Pay fields still follow `staff.pay`.
  if (access.staffPeopleVisible) {
    for (const user of listUsersForAgency(agencyId)) {
      push(candidates, {
        id: user.id,
        category: "Staff",
        title: user.name || user.email,
        subtitle: [user.email, readable(user.role)].filter(Boolean).join(" · "),
        href: `/portal/clients?view=staff&user=${encodeURIComponent(user.id)}`,
      }, [user.username]);
    }
    for (const employee of listPeopleEmployees(agencyId)) {
      push(candidates, {
        id: `employee:${employee.id}`,
        category: "Staff",
        title: employee.name,
        subtitle: [employee.title, employee.department, readable(employee.employmentType), readable(employee.status)].filter(Boolean).join(" · "),
        href: `/portal/agency/people?employee=${encodeURIComponent(employee.id)}`,
        timestamp: employee.updatedAt,
      }, [
        employee.email,
        employee.phone,
        ...(access.staffPayVisible ? [employee.currency, employee.payBasis] : []),
      ], { matchLabel: "People record", timestamp: employee.updatedAt });
    }
    for (const application of listPeopleApplications(agencyId)) {
      push(candidates, {
        id: `application:${application.id}`,
        category: "Staff",
        title: application.name,
        subtitle: ["Candidate", application.roleInterest, readable(application.stage), application.email].join(" · "),
        href: `/portal/agency/people?application=${encodeURIComponent(application.id)}`,
        timestamp: application.updatedAt,
      }, [application.phone, application.location], { matchLabel: "Recruitment application", timestamp: application.updatedAt });
    }
    for (const request of listPeopleLeaveRequests(agencyId)) {
      const employee = getState().peopleEmployees[request.employeeId];
      push(candidates, {
        id: `leave:${request.id}`,
        category: "Staff",
        title: `${employee?.name ?? "Employee"} · ${readable(request.type)} leave`,
        subtitle: `${request.startsOn} to ${request.endsOn} · ${request.days} days · ${readable(request.status)}`,
        href: "/portal/agency/people?view=time",
        timestamp: request.updatedAt,
      }, [request.note], { matchLabel: "Leave record", timestamp: request.updatedAt });
    }
    for (const training of listPeopleTraining(agencyId)) {
      const employee = getState().peopleEmployees[training.employeeId];
      push(candidates, {
        id: `training:${training.id}`,
        category: "Staff",
        title: training.title,
        subtitle: [employee?.name, readable(training.status), training.dueAt ? `Due ${formatUkDate(training.dueAt, { dateStyle: "medium" })}` : ""].filter(Boolean).join(" · "),
        href: "/portal/agency/people?view=development",
        timestamp: training.updatedAt,
      }, [training.description], { matchLabel: "Training record", timestamp: training.updatedAt });
    }
  }

  const { resolveBusinessRadarAccessForActor } = await import("@/lib/server/intelligence/personalRadarAccess");
  if (await resolveBusinessRadarAccessForActor(actor)) {
    push(candidates, {
      id: "business-radar",
      category: "Radar",
      title: "Business Radar",
      subtitle: "Organisation-wide risks, checks and evidence",
      href: "/portal/agency/radar",
    }, ["business company organisation incidents evidence"]);
  }
  return candidates;
}

async function buildCandidates(
  agencyId: string,
  userId: string,
  role: Role,
  isolatedShowcase: boolean,
  access: SearchCandidateAccess,
  actor: Awaited<ReturnType<typeof requireCurrentAccessActor>>,
): Promise<Candidate[]> {
  const state = getState();
  const clients = listClients(agencyId, { includeArchived: true });
  const clientById = new Map(clients.map(client => [client.id, client]));
  const relationshipWorkspaceCounts = clients.reduce((counts, client) => {
    const relationshipId = clientRelationshipId(client);
    counts.set(relationshipId, (counts.get(relationshipId) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const candidates: Candidate[] = [];
  const company = state.companyProfiles[agencyId] ? getCompanyProfile(agencyId) : undefined;

  const leadsInstall = getInstall({ agencyId }, "leads-pipeline");
  if (leadsInstall?.enabled) {
    ensureLeadsPipelineFoundationRegistered();
    const { prospects } = leadsContainerFor({ agencyId, storage: makePluginStorage(leadsInstall.id) as never });
    for (const prospect of await prospects.list()) {
      if (prospect.status !== "scouting") continue;
      const latestAttempt = prospect.outreachAttempts.at(-1);
      push(candidates, {
        id: `prospect:${prospect.id}`,
        category: "Lead",
        title: prospect.company || prospect.name || prospect.website || "Scouting prospect",
        subtitle: [
          "Scouting",
          prospect.niche,
          readable(prospect.qualificationState),
          prospect.nextContactAt ? `Recontact ${formatUkDate(prospect.nextContactAt, { dateStyle: "medium" })}` : "",
        ].filter(Boolean).join(" · "),
        href: "/portal/agency/pipelines/leads#scouting",
        timestamp: prospect.updatedAt,
      }, [
        prospect.name,
        prospect.email,
        prospect.phone,
        prospect.address,
        prospect.website,
        prospect.googleMapsUrl,
        prospect.instagramUrl,
        prospect.facebookUrl,
        prospect.linkedinUrl,
        prospect.source,
        prospect.foundAt,
        prospect.opportunity,
        prospect.researchNotes,
        prospect.nextStep,
        prospect.nextContactReason,
        prospect.tags.join(" "),
        prospect.notes.map(note => note.body).join(" "),
        prospect.outreachAttempts.map(attempt => `${attempt.channel} ${attempt.outcome} ${attempt.note ?? ""} ${attempt.followUpReason ?? ""}`).join(" "),
        prospect.followUps.map(followUp => `${followUp.channel ?? ""} ${followUp.status} ${followUp.reason} ${followUp.resolutionNote ?? ""}`).join(" "),
        prospect.inspectionChecks.join(" "),
      ], { matchLabel: latestAttempt ? `Scouting dossier · last ${readable(latestAttempt.outcome)}` : "Scouting dossier", timestamp: prospect.updatedAt });
    }
  }

  push(candidates, {
    id: `company:${agencyId}`,
    category: "Executive",
    title: "Battle Table",
    subtitle: "Mission, objectives, projections, capacity, capital, ownership and quarterly reviews",
    href: "/portal/agency?station=battle",
  }, company ? [
    company.mission,
    company.vision,
    company.values.join(" "),
    company.objectives.map(item => `${item.title} ${item.metric}`).join(" "),
    company.plans.map(item => `${item.title} ${item.notes ?? ""}`).join(" "),
    company.reviews.map(item => `${item.period} ${item.wins} ${item.lessons} ${item.decisions} ${item.nextPriorities}`).join(" "),
    company.capacity.areas.map(item => `${item.id} ${item.roleTitle} ${item.preferredEngagement} ${item.hiringStatus} ${item.allocationPercent}% ${item.targetUtilisationPercent}% ${item.notes ?? ""}`).join(" "),
    company.capital.shareClasses.map(item => `${item.name} ${item.notes ?? ""}`).join(" "),
    company.capital.shareholders.map(item => `${item.name} ${item.kind} ${item.notes ?? ""}`).join(" "),
    company.capital.transactions.map(item => `${item.title} ${item.kind} ${item.counterparty ?? ""} ${item.reference ?? ""} ${item.notes ?? ""}`).join(" "),
    company.capital.investments.map(item => `${item.name} ${item.kind} ${item.platform ?? ""} ${item.reference ?? ""} ${item.notes ?? ""}`).join(" "),
    company.capital.dividends.map(item => `${item.title} ${item.period} ${item.reference ?? ""} ${item.notes ?? ""}`).join(" "),
    company.capital.decisions.map(item => `${item.title} ${item.kind} ${item.summary} ${item.documentId ?? ""} ${item.notes ?? ""}`).join(" "),
  ] : []);

  if (company) {
    for (const area of company.capacity.areas) push(candidates, { id: `hiring-capacity:${area.id}`, category: "Executive", title: `${area.roleTitle} capacity`, subtitle: `${readable(area.id)} · ${area.allocationPercent}% allocation · ${area.targetUtilisationPercent}% guardrail · ${readable(area.hiringStatus)}`, href: "/portal/agency?station=battle&battle=capacity" }, [area.preferredEngagement, area.notes, "hiring recommendation capacity headcount recruitment scaling bottleneck"]);
    for (const shareholder of company.capital.shareholders) push(candidates, { id: `shareholder:${shareholder.id}`, category: "Executive", title: shareholder.name, subtitle: `${readable(shareholder.kind)} · ${shareholder.shares} shares · ${readable(shareholder.status)}`, href: "/portal/agency?station=battle&battle=capital" }, [shareholder.notes]);
    for (const investment of company.capital.investments) push(candidates, { id: `investment:${investment.id}`, category: "Executive", title: investment.name, subtitle: `${readable(investment.kind)} · ${readable(investment.status)} · ${investment.currency}`, href: "/portal/agency?station=battle&battle=capital" }, [investment.platform, investment.reference, investment.notes]);
    for (const dividend of company.capital.dividends) push(candidates, { id: `dividend:${dividend.id}`, category: "Executive", title: dividend.title, subtitle: `${dividend.period} · ${readable(dividend.status)} · ${dividend.currency}`, href: "/portal/agency?station=battle&battle=capital" }, [dividend.reference, dividend.notes]);
    for (const decision of company.capital.decisions) push(candidates, { id: `decision:${decision.id}`, category: "Executive", title: decision.title, subtitle: `${readable(decision.kind)} · ${readable(decision.status)}`, href: "/portal/agency?station=battle&battle=capital" }, [decision.summary, decision.documentId, decision.notes]);
  }

  for (const document of listLegalDocuments(agencyId)) {
    push(candidates, {
      id: document.id,
      category: "Company",
      title: document.title,
      subtitle: [readable(document.category), document.counterparty, document.reference, readable(document.status)].filter(Boolean).join(" · "),
      href: "/portal/agency/company?view=legal",
    }, [document.notes, document.fileName]);
  }

  for (const client of clients) {
    const metadata = client.metadata ?? {};
    const businessName = text(metadata.businessName);
    const contactName = text(metadata.contactName);
    const workspaceLabel = client.workspaceLabel?.trim();
    const relationshipWorkspaceCount = relationshipWorkspaceCounts.get(clientRelationshipId(client)) ?? 1;
    const clientContext = workspaceLabel ? `${client.name} · ${workspaceLabel}` : client.name;
    push(candidates, {
      id: client.id,
      category: "Client",
      title: client.name,
      subtitle: [workspaceLabel ? `Project: ${workspaceLabel}` : "", relationshipWorkspaceCount > 1 ? `Linked buyer · ${relationshipWorkspaceCount} workspaces` : "", businessName && businessName !== client.name ? businessName : "", client.ownerEmail, readable(client.stage)].filter(Boolean).join(" · "),
      href: `/portal/clients/${client.id}`,
    }, [client.slug, client.websiteUrl, workspaceLabel, client.relationshipId, text(metadata.leadSource), text(metadata.portalServicePlan), safeSerialise(metadata)]);

    const linkedContacts = Array.isArray(metadata.linkedContacts) ? metadata.linkedContacts : [];
    for (const value of linkedContacts) {
      if (!isRecord(value)) continue;
      const name = text(value.name);
      if (!name) continue;
      push(candidates, {
        id: `${client.id}:${text(value.id) || name}`,
        category: "Contact",
        title: name,
        subtitle: [text(value.role), clientContext, text(value.email), text(value.phone)].filter(Boolean).join(" · "),
        href: `/portal/clients/${client.id}?tab=overview`,
      });
    }
    if (contactName && !linkedContacts.some(value => isRecord(value) && text(value.name) === contactName)) {
      push(candidates, {
        id: `${client.id}:primary`,
        category: "Contact",
        title: contactName,
        subtitle: [clientContext, client.ownerEmail].filter(Boolean).join(" · "),
        href: `/portal/clients/${client.id}?tab=overview`,
      });
    }

    addNestedClientCandidates(candidates, client.id, clientContext, metadata);

    for (const plan of cleanClientPaymentPlans(metadata.clientPaymentPlans)) {
      push(candidates, {
        id: `client-payment-plan:${client.id}:${plan.id}`,
        category: "Invoice",
        title: plan.title,
        subtitle: [clientContext, "Payment plan", readable(plan.status), money(paymentPlanPaid(plan), plan.currency), "of", money(paymentPlanTotal(plan), plan.currency)].filter(Boolean).join(" · "),
        href: `/portal/clients/${client.id}?tab=finance`,
        timestamp: plan.updatedAt,
      }, [
        plan.summary,
        plan.internalNotes,
        plan.productIds.join(" "),
        plan.milestones.map(milestone => `${milestone.title} ${milestone.description ?? ""} ${milestone.productName ?? ""} ${milestone.invoiceNumber ?? ""} ${milestone.status} ${milestone.dueAt}`).join(" "),
        "payment schedule instalment installment commercial contract billing",
      ], { matchLabel: "Client payment plan", timestamp: plan.updatedAt });
    }

    const clientMarketing = cleanClientMarketingService(metadata.clientMarketingService);
    for (const profile of clientMarketing.profiles) {
      push(candidates, {
        id: `client-marketing-profile:${client.id}:${profile.id}`,
        category: "Campaign",
        title: `${profile.platform} · ${profile.handle}`,
        subtitle: `${clientContext} · Social profile · ${readable(profile.status)}`,
        href: `/portal/clients/${client.id}?tab=marketing`,
      }, [profile.owner, profile.url]);
    }
    for (const content of clientMarketing.content) {
      push(candidates, {
        id: `client-marketing-content:${client.id}:${content.id}`,
        category: "Campaign",
        title: content.title,
        subtitle: `${clientContext} · ${content.platform} ${content.format} · ${readable(content.status)} · ${readable(content.approval)}`,
        href: `/portal/clients/${client.id}?tab=marketing`,
        timestamp: content.updatedAt,
      }, [content.notes, content.clientFeedback, content.publishedUrl]);
    }
    for (const campaign of clientMarketing.campaigns) {
      push(candidates, {
        id: `client-marketing-campaign:${client.id}:${campaign.id}`,
        category: "Campaign",
        title: campaign.name,
        subtitle: `${clientContext} · ${campaign.platform} · ${readable(campaign.status)} · ${campaign.leads} leads · ${campaign.conversions} conversions`,
        href: `/portal/clients/${client.id}?tab=marketing`,
        timestamp: campaign.updatedAt,
      }, [campaign.objective, campaign.notes, campaign.clientFeedback]);
    }

    const requests = Array.isArray(metadata.clientRequests) ? metadata.clientRequests : [];
    for (const value of requests) {
      if (!isRecord(value)) continue;
      const message = text(value.message);
      const type = text(value.type) || "request";
      push(candidates, {
        id: `${client.id}:${text(value.id) || message}`,
        category: "Request",
        title: `${readable(type)} · ${clientContext}`,
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
    if (!access.taskVisible(task)) continue;
    push(candidates, {
      id: task.id,
      category: "Task",
      title: task.title,
      subtitle: [readable(task.status), task.priority, task.dueAt ? `Due ${formatUkDate(task.dueAt, { dateStyle: "medium" })}` : ""].filter(Boolean).join(" · "),
      href: `/portal/agency/actions?task=${encodeURIComponent(task.id)}`,
    }, [task.notes, task.recurrence]);
  }

  const calendarConnections = new Map(Object.values(state.commandCalendarConnections)
    .filter(connection => connection.agencyId === agencyId && connection.ownerUserId === userId)
    .map(connection => [connection.id, connection]));
  const calendarSources = new Map(Object.values(state.commandCalendarSources)
    .filter(source => source.agencyId === agencyId && source.ownerUserId === userId)
    .map(source => [source.id, source]));
  for (const event of Object.values(state.commandCalendarExternalEvents)) {
    if (event.agencyId !== agencyId || event.ownerUserId !== userId) continue;
    const source = calendarSources.get(event.sourceId);
    const connection = calendarConnections.get(event.connectionId);
    push(candidates, {
      id: `external-calendar:${event.id}`,
      category: "Meeting",
      title: event.title,
      subtitle: [source?.name, connection?.accountEmail, event.allDay ? "All day" : formatUkDate(event.startsAt, { dateStyle: "medium", timeStyle: "short" }), event.location].filter(Boolean).join(" · "),
      href: event.htmlLink || "/portal/agency?station=calendar",
      timestamp: event.startsAt,
    }, [event.notes, event.location, event.organizerEmail, source?.description, source?.timeZone, connection?.accountName, connection?.accountEmail], { matchLabel: "Connected Google Calendar", timestamp: event.sourceUpdatedAt ?? event.updatedAt });
  }

  const notepadFolders = new Map(listNotepadFolders(agencyId, userId).map(folder => [folder.id, folder]));
  for (const note of listNotepadNotes(agencyId, userId)) {
    if (note.status === "trashed") continue;
    const folder = note.folderId ? notepadFolders.get(note.folderId) : undefined;
    push(candidates, {
      id: note.id,
      category: "Note",
      title: note.title,
      subtitle: [folder?.name, note.status === "archived" ? "Archived" : "Personal notepad", note.tags.map(tag => `#${tag}`).join(" ")].filter(Boolean).join(" · "),
      href: `/portal/agency/notepad?note=${encodeURIComponent(note.id)}`,
    }, [note.body, note.tags.join(" "), folder?.name], { detail: note.body, matchLabel: "Notepad", timestamp: note.updatedAt });
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
      href: knowledge ? "/portal/agency/fulfilment/technical/vault" : "/portal/agency/fulfilment/technical/toolkit",
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

  for (const employee of listPeopleEmployees(agencyId)) {
    push(candidates, {
      id: `employee:${employee.id}`,
      category: "Staff",
      title: employee.name,
      subtitle: [employee.title, employee.department, readable(employee.employmentType), readable(employee.status)].filter(Boolean).join(" · "),
      href: `/portal/agency/people?employee=${encodeURIComponent(employee.id)}`,
      timestamp: employee.updatedAt,
    }, [
      employee.email,
      employee.phone,
      ...(access.staffPayVisible ? [employee.currency, employee.payBasis] : []),
      employee.workspaceAccess.map(item => `${item.stationId} ${item.mode}`).join(" "),
      employee.onboardingItems.map(item => `${item.label} ${item.status} ${item.evidence ?? ""}`).join(" "),
      ...(access.staffPayVisible
        ? [employee.commissionRules.map(rule => `${rule.label} ${rule.basis} ${rule.status} ${rule.ratePercent ?? ""}`).join(" ")]
        : []),
    ], { matchLabel: "People record", timestamp: employee.updatedAt });
  }

  for (const application of listPeopleApplications(agencyId)) {
    push(candidates, {
      id: `application:${application.id}`,
      category: "Staff",
      title: application.name,
      subtitle: ["Candidate", application.roleInterest, readable(application.stage), application.email].join(" · "),
      href: `/portal/agency/people?application=${encodeURIComponent(application.id)}`,
      timestamp: application.updatedAt,
    }, [application.phone, application.location, application.coverNote, application.availabilityNote, application.portfolioUrl, application.linkedInUrl, application.cv.fileName], { matchLabel: "Recruitment application", timestamp: application.updatedAt });
  }

  for (const request of listPeopleLeaveRequests(agencyId)) {
    const employee = getState().peopleEmployees[request.employeeId];
    push(candidates, {
      id: `leave:${request.id}`,
      category: "Staff",
      title: `${employee?.name ?? "Employee"} · ${readable(request.type)} leave`,
      subtitle: `${request.startsOn} to ${request.endsOn} · ${request.days} days · ${readable(request.status)}`,
      href: "/portal/agency/people?view=time",
      timestamp: request.updatedAt,
    }, [request.note, request.decisionNote], { matchLabel: "Leave record", timestamp: request.updatedAt });
  }

  for (const training of listPeopleTraining(agencyId)) {
    const employee = getState().peopleEmployees[training.employeeId];
    push(candidates, {
      id: `training:${training.id}`,
      category: "Staff",
      title: training.title,
      subtitle: [employee?.name, readable(training.status), training.dueAt ? `Due ${formatUkDate(training.dueAt, { dateStyle: "medium" })}` : ""].filter(Boolean).join(" · "),
      href: "/portal/agency/people?view=development",
      timestamp: training.updatedAt,
    }, [training.description, training.resourceUrl, training.evidence], { matchLabel: "Training record", timestamp: training.updatedAt });
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
      href: client ? `/portal/clients/${client.id}` : "/portal/agency/fulfilment/technical/performance",
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

  // Public showcase search is built only from its seeded tenant. These
  // adapters can reach live inbox, website, Radar and source integrations.
  if (!isolatedShowcase) {
    const [enquiriesResult, inboxResult, alertsResult, radarResult, sourceDataResult] = await Promise.allSettled([
      listWebsiteEnquiries(agencyId, 500),
      listInboxSnapshot(agencyId),
      listOperationalAlerts(agencyId),
      getCachedBusinessIssueRadar(agencyId),
      listRadarSourceSearchDatasetsForActor(actor),
    ]);
    if (enquiriesResult.status === "fulfilled") addWebsiteEnquiryCandidates(candidates, enquiriesResult.value);
    if (inboxResult.status === "fulfilled") addInboxCandidates(candidates, inboxResult.value);
    const alerts = alertsResult.status === "fulfilled" ? alertsResult.value : [];
    for (const alert of alerts) {
      push(candidates, {
        id: `notification:${alert.id}`,
        category: "Notification",
        title: alert.title,
        subtitle: [alert.detail, alert.clientName, readable(alert.category), readable(alert.severity)].filter(Boolean).join(" · "),
        href: alert.href,
      }, ["alert", "notification", "needs attention", alert.category, alert.severity]);
    }
    if (radarResult.status === "fulfilled") {
      const evidence = inspectRadarEvidence(agencyId);
      addRadarCandidates(candidates, radarResult.value, evidence);
      const intelligenceResult = await Promise.allSettled([
        buildCommandIntelligenceSnapshot({ agencyId, radar: radarResult.value, evidence }),
      ]);
      if (intelligenceResult[0]?.status === "fulfilled") addCommandIntelligenceCandidates(candidates, intelligenceResult[0].value);
    }
    if (sourceDataResult.status === "fulfilled") addSourceDataCandidates(candidates, sourceDataResult.value);
  }
  return candidates;
}

function addCommandIntelligenceCandidates(candidates: Candidate[], snapshot: CommandIntelligenceSnapshot) {
  for (const kpi of snapshot.kpis) {
    push(candidates, {
      id: `command-kpi:${kpi.id}`,
      category: "KPI",
      title: kpi.label,
      subtitle: [kpi.scope.label, kpi.display, readable(kpi.status), readable(kpi.domain), `Target ${kpi.target}`, kpi.plan.targetValue === null ? "Plan target not set" : `Plan ${kpi.plan.baselineValue ?? "?"} to ${kpi.plan.targetValue}`].join(" · "),
      href: `/portal/agency?station=intelligence&view=compare&kpi=${encodeURIComponent(kpi.id)}&scope=${encodeURIComponent(kpi.scope.id)}`,
    }, [
      kpi.shortLabel,
      kpi.detail,
      kpi.sourceId,
      kpi.evidence.join(" "),
      kpi.value,
      kpi.previousValue,
      kpi.sampleSize,
      kpi.history.map(point => `${point.at} ${point.value}`).join(" "),
      safeSerialise(kpi.plan),
      kpi.scope.label,
      "executive metric command centre omega dashboard trend graph compare baseline target projection forecast pace variance gap",
    ], { detail: `${kpi.detail} ${kpi.evidence.join(" ")} Planning baseline ${kpi.plan.baselineValue ?? "not set"}; target ${kpi.plan.targetValue ?? "not set"}; ${kpi.plan.direction} is better; ${kpi.plan.cadence}; source ${kpi.plan.source}.`, matchLabel: `${readable(kpi.domain)} KPI`, timestamp: kpi.measuredAt });
  }

  const baseKpis = new Map(snapshot.kpis.map(kpi => [kpi.id, kpi]));
  for (const scope of snapshot.scopes) {
    const scopeHref = `/portal/agency?station=intelligence&view=kpis&scope=${encodeURIComponent(scope.id)}`;
    push(candidates, {
      id: `command-scope:${scope.id}`,
      category: "Source",
      title: scope.label,
      subtitle: [readable(scope.kind), `${scope.propertyCount} ${scope.propertyCount === 1 ? "property" : "properties"}`, `${scope.inheritGlobalKpis ? snapshot.kpis.length : scope.readings.length}/20 KPIs available`].join(" · "),
      href: scopeHref,
    }, [scope.detail, scope.publicUrl, scope.parentId, safeSerialise(scope.readings), "KPI intelligence scope website traffic forms conversions company client whole Aqua ecosystem"], {
      detail: scope.detail,
      matchLabel: `${readable(scope.kind)} intelligence scope`,
      timestamp: snapshot.generatedAt,
    });

    for (const reading of scope.readings) {
      const base = baseKpis.get(reading.kpiId);
      if (!base) continue;
      push(candidates, {
        id: `command-scope-kpi:${scope.id}:${reading.kpiId}`,
        category: "KPI",
        title: `${base.label} · ${scope.label}`,
        subtitle: [reading.display, readable(reading.status), readable(scope.kind), `${reading.sampleSize ?? 0} sample`].join(" · "),
        href: `/portal/agency?station=intelligence&view=compare&kpi=${encodeURIComponent(reading.kpiId)}&scope=${encodeURIComponent(scope.id)}`,
      }, [base.shortLabel, reading.detail, reading.sourceId, reading.evidence.join(" "), scope.detail, scope.publicUrl, safeSerialise(reading.history), safeSerialise(reading.plan), "scoped exact evidence graph baseline target projection"], {
        detail: `${reading.detail} ${reading.evidence.join(" ")} Scope ${scope.label}. Planning source ${reading.plan.source}.`,
        matchLabel: `${scope.label} KPI`,
        timestamp: reading.measuredAt,
      });
    }
  }

  for (const campaign of snapshot.campaigns) {
    push(candidates, {
      id: `command-campaign:${campaign.id}`,
      category: "Campaign",
      title: campaign.name,
      subtitle: [readable(campaign.channel), readable(campaign.kind), readable(campaign.status), `${campaign.attributedLeads} leads`].join(" · "),
      href: `/portal/agency?station=intelligence&view=campaigns&campaign=${encodeURIComponent(campaign.id)}`,
    }, [safeSerialise(campaign), "budget spend revenue roas attribution campaign"], {
      detail: `Budget ${campaign.budgetCents}; spend ${campaign.spendCents}; attributed revenue ${campaign.attributedRevenueCents}; ${campaign.completedSteps}/${campaign.totalSteps} steps complete.`,
      matchLabel: "Campaign intelligence",
      timestamp: campaign.updatedAt,
    });
  }

  for (const profile of snapshot.audienceProfiles) {
    push(candidates, {
      id: `command-audience:${profile.id}`,
      category: "Audience",
      title: profile.name,
      subtitle: [profile.segment, readable(profile.audienceType), readable(profile.confidence), readable(profile.status)].filter(Boolean).join(" · "),
      href: `/portal/agency?station=intelligence&view=audiences&audience=${encodeURIComponent(profile.id)}`,
    }, [safeSerialise(profile), "customer profile persona demographic interests targeting audience marketing"], {
      detail: [profile.researchNotes, ...profile.goals, ...profile.painPoints, ...profile.motivations, ...profile.objections].filter(Boolean).join(" · "),
      matchLabel: "Customer profile",
      timestamp: profile.updatedAt,
    });
  }

  for (const signal of snapshot.audienceSignals) {
    push(candidates, {
      id: `audience-signal:${signal.id}`,
      category: "Audience",
      title: signal.label,
      subtitle: `${readable(signal.category)} · ${signal.count} profiles`,
      href: "/portal/agency?station=intelligence&view=audiences",
    }, [signal.profileNames.join(" "), "interest audience signal customer profile marketing"], { matchLabel: "Audience signal" });
  }
  for (const demographic of snapshot.audienceDemographics) {
    push(candidates, {
      id: `audience-demographic:${demographic.id}`,
      category: "Audience",
      title: demographic.label,
      subtitle: `${readable(demographic.category)} · ${demographic.count} profiles`,
      href: "/portal/agency?station=intelligence&view=audiences",
    }, [demographic.profileNames.join(" "), "demographic customer profile segment marketing"], { matchLabel: "Audience demographic" });
  }
  for (const location of snapshot.audienceLocations) {
    push(candidates, {
      id: `audience-location:${location.id}`,
      category: "Audience",
      title: location.label,
      subtitle: `${location.count} profiles · ${location.mapped ? "Mapped" : "Unmapped"}`,
      href: "/portal/agency?station=intelligence&view=audiences",
    }, [location.profileNames.join(" "), location.x, location.y, "customer location geography map demographic"], { matchLabel: "Audience location" });
  }
  for (const cohort of snapshot.sourceCohorts) {
    push(candidates, {
      id: `source-cohort:${cohort.id}`,
      category: "KPI",
      title: `${cohort.label} acquisition cohort`,
      subtitle: `${cohort.leads} leads · ${cohort.converted} converted · ${cohort.clients} clients`,
      href: "/portal/agency?station=intelligence&view=overview",
    }, [safeSerialise(cohort), "lead source conversion churn attribution cohort"], { matchLabel: "Commercial cohort" });
  }

  for (const metric of snapshot.commercialIntelligence.formulas) {
    push(candidates, {
      id: `commercial-formula:${metric.id}`,
      category: "KPI",
      title: metric.label,
      subtitle: [metric.display, readable(metric.category), readable(metric.status), `Target ${metric.target}`].join(" · "),
      href: `/portal/agency?station=intelligence&view=lifecycle&metric=${encodeURIComponent(metric.id)}`,
    }, [metric.formula, metric.source, metric.detail, metric.target, metric.numerator, metric.denominator, metric.evidence.join(" "), "customer lead lifecycle pipeline marketing client formula calculation"], {
      detail: `${metric.detail} Formula: ${metric.formula}. Source: ${metric.source}. Evidence: ${metric.evidence.join(" ")}.`,
      matchLabel: `${readable(metric.category)} formula`,
      timestamp: snapshot.commercialIntelligence.generatedAt,
    });
  }

  for (const person of snapshot.commercialIntelligence.people) {
    push(candidates, {
      id: `commercial-person:${person.id}`,
      category: person.kind === "client" ? "Client" : "Lead",
      title: person.name,
      subtitle: [person.company, person.source, person.campaignName, person.stageLabel, readable(person.state)].filter(Boolean).join(" · "),
      href: `/portal/agency?station=intelligence&view=lifecycle&record=${encodeURIComponent(person.id)}`,
    }, [person.email, person.tags.join(" "), person.clientId, person.clientStatus, person.enquiryCount, person.touchCount, person.responseMs, person.timeToConversionMs, person.href, "attribution acquisition customer journey pipeline record lineage"], {
      detail: `${person.name} entered from ${person.source}${person.campaignName ? ` through ${person.campaignName}` : ""}, is at ${person.stageLabel}, has ${person.enquiryCount} enquiries and ${person.touchCount} recorded commercial touches.`,
      matchLabel: person.kind === "client" ? "Customer lineage" : "Lead lineage",
      timestamp: person.capturedAt,
    });
  }

  for (const source of snapshot.commercialIntelligence.sources) {
    push(candidates, {
      id: `commercial-source:${source.id}`,
      category: "KPI",
      title: `${source.label} acquisition performance`,
      subtitle: `${source.leads} leads · ${source.won} won · ${source.clients} clients · ${source.conversionRatePercent ?? "No sample"}% conversion`,
      href: `/portal/agency?station=intelligence&view=lifecycle&source=${encodeURIComponent(source.id)}`,
    }, [source.campaignName, source.channel, safeSerialise(source), "source campaign cost per lead cac roas retention conversion win rate"], {
      detail: `Open ${source.open}; won ${source.won}; lost ${source.lost}; active clients ${source.activeClients}; churned ${source.churnedClients}; spend ${source.spendCents}; revenue ${source.revenueCents}.`,
      matchLabel: "Acquisition source",
      timestamp: snapshot.commercialIntelligence.generatedAt,
    });
  }

  for (const stage of snapshot.commercialIntelligence.stages) {
    push(candidates, {
      id: `commercial-stage:${stage.id}`,
      category: "KPI",
      title: `${stage.label} pipeline stage`,
      subtitle: `${stage.leadCount} leads · ${stage.staleCount} stale · ${stage.conversionToNextPercent ?? "terminal"}${stage.conversionToNextPercent === null ? "" : "% to next"}`,
      href: `/portal/agency?station=intelligence&view=lifecycle&stage=${encodeURIComponent(stage.id)}`,
    }, [stage.recordIds.join(" "), stage.sharePercent, stage.medianAgeMs, "pipeline occupancy ageing progression dropoff customer lead"], { matchLabel: "Pipeline stage", timestamp: snapshot.commercialIntelligence.generatedAt });
  }
}

function addRadarCandidates(candidates: Candidate[], radar: BusinessIssueRadar, evidence: RadarEvidenceInspectionIndex) {
  for (const [metric, value] of Object.entries(radar.summary)) {
    push(candidates, {
      id: `radar-summary:${metric}`,
      category: "KPI",
      title: readable(metric),
      subtitle: `${String(value)} · Radar executive metric`,
      href: `/portal/agency/radar?view=kpis&query=${encodeURIComponent(metric)}`,
    }, [metric, value, "radar summary omega command centre metric"], { matchLabel: "Radar KPI", timestamp: radar.generatedAt });
  }
  for (const [metric, value] of scalarEntries(radar.speedToLead)) {
    push(candidates, {
      id: `radar-speed:${metric}`,
      category: "KPI",
      title: `Speed to lead · ${readable(metric)}`,
      subtitle: `${String(value)} · Sales response clock`,
      href: `/portal/agency/radar?view=kpis&query=${encodeURIComponent(metric)}&domain=sales`,
    }, [metric, value, "enquiry response wait time sla speed lead"], { matchLabel: "Speed-to-lead KPI", timestamp: radar.generatedAt });
  }
  for (const [metric, value] of scalarEntries(radar.commercial)) {
    if (["generatedAt", "latestActivityAt"].includes(metric)) continue;
    push(candidates, {
      id: `radar-commercial:${metric}`,
      category: "KPI",
      title: readable(metric),
      subtitle: `${String(value)} · Commercial lifecycle`,
      href: `/portal/agency/radar?view=kpis&query=${encodeURIComponent(metric)}`,
    }, [metric, value, "lead conversion retention churn source commercial lifecycle"], { matchLabel: "Commercial KPI", timestamp: radar.commercial.latestActivityAt ?? radar.generatedAt });
  }

  for (const incident of radar.incidents) {
    push(candidates, {
      id: `radar-incident:${incident.id}`,
      category: "Radar",
      title: incident.title,
      subtitle: [readable(incident.severity), readable(incident.domain), `${incident.findingCount} exact findings`].join(" · "),
      href: radarInspectorHref("incidents", incident.id, incident.domain),
    }, [incident.id, incident.detail, incident.evidence.join(" "), incident.issueIds.join(" "), incident.checkIds.join(" "), incident.sourceIds.join(" ")], {
      detail: `${incident.detail} ${incident.evidence.join(" ")}`,
      matchLabel: "Radar incident",
      timestamp: incident.detectedAt,
    });
  }
  const groupedIssueIds = new Set(radar.incidents.flatMap(incident => incident.issueIds));
  for (const issue of radar.issues) {
    if (groupedIssueIds.has(issue.id)) continue;
    push(candidates, {
      id: `radar-issue:${issue.id}`,
      category: "Radar",
      title: issue.title,
      subtitle: [readable(issue.severity), readable(issue.domain), issue.id].join(" · "),
      href: radarInspectorHref("incidents", issue.id, issue.domain),
    }, [issue.detail, issue.evidence.join(" "), issue.sourceIds.join(" ")], { detail: issue.detail, matchLabel: "Radar finding", timestamp: issue.detectedAt });
  }
  for (const check of radar.checks) {
    const params = new URLSearchParams({ view: "checks", query: check.id, domain: check.domain, status: check.status, scope: check.scope, lens: check.lens });
    push(candidates, {
      id: `radar-check:${check.id}`,
      category: "Check",
      title: check.title,
      subtitle: [readable(check.status), readable(check.domain), check.familyLabel, check.lensLabel].join(" · "),
      href: `/portal/agency/radar?${params.toString()}`,
    }, [check.id, check.ruleId, check.familyId, check.sourceId, check.detail, check.evidence.join(" "), check.value, check.previousValue, safeSerialise(check.policy)], {
      detail: `${check.detail} ${check.evidence.join(" ")}`,
      matchLabel: `${readable(check.domain)} Radar check`,
      timestamp: check.lastSeenAt ?? check.measuredAt,
    });
  }
  for (const signal of radar.signals) {
    push(candidates, {
      id: `radar-signal:${signal.id}`,
      category: "KPI",
      title: signal.label,
      subtitle: [signal.display, readable(signal.status), readable(signal.domain), `Target ${signal.target}`].join(" · "),
      href: radarInspectorHref("kpis", signal.id, signal.domain),
    }, [signal.id, signal.value, signal.detail, signal.sampleSize], { detail: signal.detail, matchLabel: `${readable(signal.domain)} signal`, timestamp: signal.measuredAt });
  }
  for (const source of radar.coverage) {
    push(candidates, {
      id: `radar-source:${source.id}`,
      category: "Source",
      title: source.label,
      subtitle: [readable(source.status), readable(source.domain), `${source.recordCount} records`].join(" · "),
      href: `/portal/agency/radar?view=sources&source=${encodeURIComponent(source.id)}&domain=${source.domain}`,
    }, [source.id, source.detail, "connection coverage freshness evidence source"], { detail: source.detail, matchLabel: "Radar source", timestamp: source.lastActivityAt });
  }
  for (const domain of radar.domains) {
    push(candidates, {
      id: `radar-domain:${domain.domain}`,
      category: "Radar",
      title: `${readable(domain.domain)} Radar`,
      subtitle: `${domain.totalChecks} checks · ${domain.firingChecks} firing · ${domain.blindChecks} blind`,
      href: `/portal/agency/radar?view=checks&domain=${domain.domain}`,
    }, [safeSerialise(domain), "domain scanner ledger coverage assurance readiness"], { matchLabel: "Radar domain", timestamp: domain.lastSignalAt });
  }
  for (const conclusion of radar.adaptive.conclusions) {
    push(candidates, {
      id: `radar-conclusion:${conclusion.id}`,
      category: "Radar",
      title: conclusion.title,
      subtitle: [readable(conclusion.severity), readable(conclusion.domain), "Adaptive conclusion"].join(" · "),
      href: conclusion.href || radarInspectorHref("incidents", conclusion.id, conclusion.domain),
    }, [conclusion.id, conclusion.detail, "business health confidence readiness setup adaptive policy"], { detail: conclusion.detail, matchLabel: "Radar conclusion", timestamp: radar.generatedAt });
  }
  for (const series of evidence.series) {
    push(candidates, {
      id: `radar-evidence:${series.id}`,
      category: "Evidence",
      title: series.familyLabel,
      subtitle: [readable(series.domain), `${series.totalSamples} samples`, series.latestValue === undefined ? "No current value" : `Latest ${series.latestValue}`].join(" · "),
      href: radarInspectorHref("evidence", series.id, series.domain),
    }, [series.id, series.familyId, series.sourceId, series.expectedDirection, series.latestStatus, series.recentPoints.map(point => `${point.at} ${point.value} ${point.status}`).join(" "), series.recentHourly.map(hour => safeSerialise(hour)).join(" ")], {
      detail: `${series.retainedPointCount} retained points and ${series.hourlyRollupCount} hourly rollups.`,
      matchLabel: "Radar evidence series",
      timestamp: series.lastSeenAt,
    });
  }
}

function addSourceDataCandidates(candidates: Candidate[], datasets: RadarSourceSearchDataset[]) {
  for (const dataset of datasets) {
    const datasetHref = `/portal/agency/radar?view=records&dataset=${encodeURIComponent(dataset.id)}`;
    push(candidates, {
      id: `source-dataset:${dataset.id}`,
      category: "Source",
      title: dataset.label,
      subtitle: [readable(dataset.status), readable(dataset.domain), `${dataset.recordCount} records`].join(" · "),
      href: datasetHref,
    }, [dataset.id, dataset.description, dataset.sourceIds.join(" "), dataset.fields.join(" "), dataset.unavailableReason], {
      detail: dataset.unavailableReason || dataset.description,
      matchLabel: "Business dataset",
      timestamp: dataset.lastUpdatedAt,
    });

    dataset.records.forEach((record, index) => {
      const serialised = safeSerialise(record);
      if (!serialised || serialised === "{}") return;
      const identity = recordIdentity(record, index);
      const title = firstText(record, ["title", "name", "label", "subject", "number", "email", "message", "description", "recordType", "storageKey"])
        || `${dataset.label} record ${index + 1}`;
      const status = firstText(record, ["status", "stage", "state", "type", "kind", "category"]);
      push(candidates, {
        id: `source-record:${dataset.id}:${identity}:${index}`,
        category: "Data",
        title,
        subtitle: [dataset.label, status ? readable(status) : "", readable(dataset.domain)].filter(Boolean).join(" · "),
        href: `${datasetHref}&query=${encodeURIComponent(identity)}`,
      }, [identity, dataset.id, dataset.sourceIds.join(" "), dataset.fields.join(" "), serialised], {
        detail: serialised,
        matchLabel: `${dataset.label} record`,
        timestamp: timestampFromSearchRecord(record),
      });
    });
  }
}

function radarInspectorHref(view: "kpis" | "incidents" | "evidence", query: string, domain: string): string {
  return `/portal/agency/radar?view=${view}&query=${encodeURIComponent(query)}&domain=${encodeURIComponent(domain)}`;
}

function scalarEntries(value: object): Array<[string, string | number | boolean]> {
  return Object.entries(value).filter((entry): entry is [string, string | number | boolean] => ["string", "number", "boolean"].includes(typeof entry[1]));
}

function recordIdentity(record: Record<string, unknown>, index: number): string {
  for (const key of ["id", "recordId", "clientId", "taskId", "enquiryId", "storageKey", "slug", "email", "number"]) {
    const value = record[key];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim().slice(0, 240);
  }
  return `row-${index + 1}`;
}

function timestampFromSearchRecord(record: Record<string, unknown>): number | undefined {
  for (const key of ["updatedAt", "submittedAt", "occurredAt", "receivedAt", "sentAt", "createdAt", "ts", "finishedAt", "lastMessageAt", "measuredAt"]) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function addWebsiteEnquiryCandidates(candidates: Candidate[], enquiries: WebsiteEnquiry[]) {
  for (const enquiry of enquiries) {
    const view = enquiry.channel === "chatbot" ? "chatbot" : enquiry.channel === "support" ? "support" : "forms";
    const detail = enquiry.message || [enquiry.services.join(", "), enquiry.campaign].filter(Boolean).join(" · ");
    push(candidates, {
      id: `enquiry:${enquiry.id}`,
      category: "Enquiry",
      title: enquiry.name || enquiry.email || "Website enquiry",
      subtitle: [enquiry.brandName, enquiry.email, enquiry.phone, readable(enquiry.topic), readable(enquiry.classification), readable(enquiry.status)].filter(Boolean).join(" · "),
      href: `/portal/agency/inbox?view=${view}&form=${encodeURIComponent(enquiry.id)}`,
    }, [
      enquiry.email,
      enquiry.phone,
      enquiry.contactMethod,
      enquiry.services.join(" "),
      enquiry.message,
      enquiry.sourceUrl,
      enquiry.campaign,
      enquiry.classification,
      enquiry.routeNote,
      enquiry.siteName,
      enquiry.siteHost,
      enquiry.pagePath,
      ...enquiry.replies.flatMap(reply => [reply.subject, reply.message, reply.recipient, reply.senderLabel, reply.channel]),
      ...enquiry.calls.flatMap(call => [call.notes, call.outcome, call.senderLabel, call.phone]),
    ], {
      detail,
      matchLabel: "Website enquiry",
      timestamp: enquiry.submittedAt,
    });
    for (const reply of enquiry.replies) {
      push(candidates, {
        id: `enquiry-reply:${enquiry.id}:${reply.id}`,
        category: "Message",
        title: `${readable(reply.channel)} to ${enquiry.name}`,
        subtitle: [enquiry.brandName, reply.senderLabel, reply.status].filter(Boolean).join(" · "),
        href: `/portal/agency/inbox?view=${view}&form=${encodeURIComponent(enquiry.id)}`,
      }, [reply.subject, reply.message, reply.recipient, reply.senderLabel, reply.externalMessageId], {
        detail: reply.message,
        matchLabel: "Enquiry reply",
        timestamp: reply.sentAt,
      });
    }
    for (const call of enquiry.calls) {
      push(candidates, {
        id: `enquiry-call:${enquiry.id}:${call.id}`,
        category: "Contact",
        title: `Call with ${enquiry.name}`,
        subtitle: [enquiry.brandName, call.senderLabel, call.outcome ? readable(call.outcome) : readable(call.status)].filter(Boolean).join(" · "),
        href: `/portal/agency/inbox?view=${view}&form=${encodeURIComponent(enquiry.id)}`,
      }, [call.phone, call.notes, call.outcome, call.senderLabel], {
        detail: call.notes || (call.outcome ? `Outcome: ${readable(call.outcome)}` : "Call in progress"),
        matchLabel: "Contact call",
        timestamp: call.startedAt,
      });
    }
  }
}

function addInboxCandidates(candidates: Candidate[], snapshot: InboxSnapshot) {
  for (const conversation of snapshot.conversations) {
    const identity = conversation.identity;
    const channel = readable(conversation.connection.channel);
    const conversationHref = `/portal/agency/inbox?view=social&thread=${encodeURIComponent(conversation.id)}`;
    push(candidates, {
      id: `conversation:${conversation.id}`,
      category: "Message",
      title: identity.displayName || identity.username || "Social conversation",
      subtitle: [channel, identity.username ? `@${identity.username.replace(/^@/, "")}` : "", readable(conversation.status), conversation.tags.join(", ")].filter(Boolean).join(" · "),
      href: conversationHref,
    }, [conversation.source, conversation.campaign, conversation.referralUrl, safeSerialise(conversation.metadata)], {
      detail: conversation.messages.at(-1)?.text,
      matchLabel: `${channel} conversation`,
      timestamp: conversation.lastMessageAt,
    });

    for (const message of conversation.messages) {
      const attachmentText = message.attachments.map(attachment => `${attachment.title ?? ""} ${attachment.mimeType ?? ""}`).join(" ");
      const detail = message.text || attachmentText || readable(message.type);
      push(candidates, {
        id: `message:${message.id}`,
        category: "Message",
        title: identity.displayName || identity.username || "Social message",
        subtitle: [channel, identity.username ? `@${identity.username.replace(/^@/, "")}` : "", readable(message.direction), readable(message.type)].filter(Boolean).join(" · "),
        href: conversationHref,
      }, [message.text, attachmentText, safeSerialise(message.metadata)], {
        detail,
        matchLabel: `${channel} message`,
        timestamp: message.sentAt,
      });
    }
  }
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
      href: "/portal/agency/fulfilment/technical/workflow",
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
      href: "/portal/agency/fulfilment/technical/performance",
    }, [experiment.hypothesis, experiment.variants.map(variant => variant.name).join(" ")]);
  }

  const website = state.agencyWebsites[agencyId];
  if (website) {
    push(candidates, {
      id: `website:${agencyId}`,
      category: "Website",
      title: website.name,
      subtitle: [readable(website.status), website.productionUrl].filter(Boolean).join(" · "),
      href: "/portal/agency/fulfilment/technical/website",
    }, [website.gateHeadline, website.gateMessage, website.maintenanceMessage, website.previewUrl, website.repositoryUrl, website.localPath]);
    for (const page of website.pages) {
      push(candidates, {
        id: `website:${agencyId}:${page.route}`,
        category: "Website",
        title: page.label,
        subtitle: [page.route, readable(page.status), page.message].filter(Boolean).join(" · "),
        href: "/portal/agency/fulfilment/technical/website",
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
        href: "/portal/agency/fulfilment/technical/performance",
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
        href: "/portal/agency/portals/forms",
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
          href: `/portal/agency/agency-finance/payments?entry=${encodeURIComponent(id)}`,
        }, [text(value.description), text(value.notes), text(value.reference)]);
      }
    }
  }
}

function push(candidates: Candidate[], result: GlobalSearchResult, extra: Array<unknown> = [], options: CandidateOptions = {}) {
  const detailText = options.detail?.trim() || result.subtitle || "";
  candidates.push({
    ...result,
    timestamp: options.timestamp ?? result.timestamp,
    searchText: [result.category, options.matchLabel, result.title, result.subtitle, detailText, ...extra.map(searchTerm)].filter(Boolean).join(" "),
    detailText,
    matchLabel: options.matchLabel || result.category,
  });
}

function categoryCounts(candidates: Candidate[]): Record<string, number> {
  return candidates.reduce<Record<string, number>>((counts, candidate) => {
    counts[candidate.category] = (counts[candidate.category] ?? 0) + 1;
    return counts;
  }, {});
}

function score(candidate: Candidate, query: string): number {
  const normalised = normalise(query);
  if (!normalised) return 0;
  const title = normalise(candidate.title);
  const subtitle = normalise(candidate.subtitle ?? "");
  const detail = normalise(candidate.detailText);
  const searchable = normalise(candidate.searchText);
  let result = 0;
  if (title === normalised) result = 190;
  else if (title.startsWith(normalised)) result = 172;
  else if (title.includes(normalised)) result = 154;
  else if (subtitle.includes(normalised)) result = 132;
  else if (detail.includes(normalised)) result = 118;
  else if (searchable.includes(normalised)) result = 104;

  const terms = normalised.split(/\s+/).filter(Boolean);
  const words = searchable.split(/[^\p{L}\p{N}@._:/-]+/u).filter(Boolean);
  const allTermsMatch = terms.every(term => term.length <= 2
    ? words.some(word => word.startsWith(term))
    : searchable.includes(term));
  if (allTermsMatch) result = Math.max(result, 88 + Math.min(terms.length * 4, 16));

  if (!result && terms.every(term => fuzzyTermMatch(term, words))) result = 62 + Math.min(terms.length * 3, 12);
  if (!result) return 0;

  const categoryBoost: Partial<Record<GlobalSearchResult["category"], number>> = {
    KPI: 24,
    Radar: 14,
    Campaign: 12,
    Audience: 12,
    Client: 10,
    Lead: 10,
    Enquiry: 10,
    Source: 8,
    Evidence: 6,
    Data: -4,
  };
  result += categoryBoost[candidate.category] ?? 0;

  const timestamp = candidate.timestamp ?? 0;
  if (timestamp > 0) {
    const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);
    result += Math.max(0, 8 - Math.floor(ageDays / 45));
  }
  return result;
}

function fuzzyTermMatch(term: string, words: string[]): boolean {
  if (term.length < 4) return words.some(word => word.startsWith(term));
  return words.some(word => word.startsWith(term) || editDistanceWithinOne(term, word));
}

function editDistanceWithinOne(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left === right) return true;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
}

function contextualSnippet(value: string, query: string, length = 190): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length <= length) return clean;
  const normalisedValue = normalise(clean);
  const normalisedQuery = normalise(query);
  const terms = normalisedQuery.split(/\s+/).filter(term => term.length > 1);
  let matchIndex = normalisedValue.indexOf(normalisedQuery);
  if (matchIndex < 0) {
    matchIndex = terms.reduce((found, term) => found >= 0 ? found : normalisedValue.indexOf(term), -1);
  }
  const start = Math.max(0, Math.min(clean.length - length, matchIndex < 0 ? 0 : matchIndex - Math.floor(length * 0.28)));
  const excerpt = clean.slice(start, start + length).trim();
  return `${start > 0 ? "…" : ""}${excerpt}${start + length < clean.length ? "…" : ""}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function searchTerm(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
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
  if (pluginId === "fulfillment") return "/portal/agency/fulfilment";
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
