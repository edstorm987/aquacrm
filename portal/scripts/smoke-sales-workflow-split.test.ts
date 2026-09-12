import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { before, describe, it } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  paths: [],
  children: [],
} as never;

import type { NavPanel } from "../src/lib/chrome/sidebarLayout";
import type { ProspectWorkflowState } from "../src/lib/sales/prospectWorkflow";

import { paginateScoutingIntake } from "../src/lib/sales/scoutingIntake";

type DepartmentLens = typeof import("../src/lib/chrome/departmentLens");
type FocusLockdown = typeof import("../src/lib/chrome/focusLockdown");
type FocusReveal = typeof import("../src/lib/chrome/focusReveal");
type SidebarLayout = typeof import("../src/lib/chrome/sidebarLayout");
type ProspectWorkflow = typeof import("../src/lib/sales/prospectWorkflow");
let applyDepartmentLens: DepartmentLens["applyDepartmentLens"];
let focusLockdown: FocusLockdown["focusLockdown"];
let revealFocusPanels: FocusReveal["revealFocusPanels"];
let buildSidebar: SidebarLayout["buildSidebar"];
let prospectVisibleInWorkspace: ProspectWorkflow["prospectVisibleInWorkspace"];
let prospectWorkflowDesk: ProspectWorkflow["prospectWorkflowDesk"];

before(async () => {
  ({ applyDepartmentLens } = await import("../src/lib/chrome/departmentLens"));
  ({ focusLockdown } = await import("../src/lib/chrome/focusLockdown"));
  ({ revealFocusPanels } = await import("../src/lib/chrome/focusReveal"));
  ({ buildSidebar } = await import("../src/lib/chrome/sidebarLayout"));
  ({ prospectVisibleInWorkspace, prospectWorkflowDesk } = await import("../src/lib/sales/prospectWorkflow"));
});

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function renderedIds(panels: NavPanel[]): string[] {
  return panels
    .filter(panel => !panel.hidden && panel.items.length > 0)
    .flatMap(panel => panel.items.map(item => item.id));
}

describe("the Sales workflow is one record flow with overlapping workbenches", () => {
  const states: ProspectWorkflowState[] = ["unreviewed", "researching", "ready", "outreach", "engaged", "not-now"];

  it("suggests a next desk without preventing research or outreach in either order", () => {
    assert.deepEqual(states.filter(state => prospectWorkflowDesk(state) === "researching"), ["unreviewed", "researching"]);
    assert.deepEqual(states.filter(state => prospectWorkflowDesk(state) === "prospecting"), ["ready", "outreach", "engaged", "not-now"]);
    for (const state of states) {
      assert.equal(prospectVisibleInWorkspace(state, "researching"), true, `${state} remains researchable`);
      assert.equal(prospectVisibleInWorkspace(state, "prospecting"), true, `${state} remains contactable`);
    }
  });

  it("keeps Scouting as intake rather than a parallel qualification queue", () => {
    assert.deepEqual(states.filter(state => prospectVisibleInWorkspace(state, "scouting")), ["unreviewed"]);
    const server = read("src/app/portal/agency/scouting/_ScoutingWorkspaceServer.tsx");
    assert.match(server, /prospectVisibleInWorkspace\(prospect\.qualificationState, workspaceMode\)/);
  });

  it("mounts the three routes through one access and data-loading boundary", () => {
    const shared = read("src/app/portal/agency/_SalesProspectWorkspacePage.tsx");
    assert.match(shared, /requireRole\(\["agency-owner", "agency-manager"\]\)/);
    assert.match(shared, /requireCurrentWorkspaceElementAccess\("growth", "growth\.outreach", "use"\)/);
    assert.match(read("src/app/portal/agency/scouting/page.tsx"), /workspaceMode="scouting"/);
    assert.match(read("src/app/portal/agency/researching/page.tsx"), /workspaceMode="researching"/);
    assert.match(read("src/app/portal/agency/prospecting/page.tsx"), /workspaceMode="prospecting"/);
  });
});

describe("Sales navigation tells the requested story without changing Owner Journey", () => {
  it("keeps separate desks hidden in the no-hat Owner view and exposes one Journey", () => {
    const owner = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
    const visible = renderedIds(owner);
    assert.ok(visible.includes("pipelines"), "Owner must retain the consolidated Journey row");
    for (const focused of ["scouting", "researching", "prospecting", "meetings", "contacts"]) {
      assert.ok(!visible.includes(focused), `${focused} must stay hidden until Sales focus is active`);
    }
    const salesPanel = owner.find(panel => panel.id === "sales");
    assert.equal(salesPanel?.hidden, true);
  });

  it("locks Sales focus to the exact six-view operating loop", () => {
    const owner = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
    const lensed = applyDepartmentLens(owner, "sales");
    const revealed = revealFocusPanels(lensed, "sales");
    const locked = focusLockdown(owner, revealed, "sales");
    assert.deepEqual(renderedIds(locked), ["scouting", "researching", "prospecting", "meetings", "inbox", "contacts"]);
    assert.deepEqual(
      locked.find(panel => panel.id === "sales")?.items.map(item => item.label),
      ["Scouting", "Researching", "Outreach Command", "Meetings", "Inbox", "Contacts"],
    );
  });

  it("does not let saved-tab personalisation widen or reorder Sales focus", () => {
    assert.match(read("src/lib/server/chrome/personalPanels.ts"), /if \(department === "sales"\) return locked/);
  });
});

describe("Scouting is map-first and accepts classified spreadsheet intake", () => {
  const map = read("src/app/portal/agency/pipelines/[slug]/_GoogleBusinessScout.tsx");
  const importer = read("src/app/portal/agency/pipelines/[slug]/_ProspectImportDialog.tsx");
  const handlers = read("src/built-ins/modules/leads-pipeline/src/api/handlers.ts");

  it("uses Google's supported embedded map and no fake Aqua results layer", () => {
    assert.match(map, /www\.google\.com\/maps\/embed\/v1\/search/);
    assert.match(map, /<iframe/);
    assert.match(map, /referrerPolicy="strict-origin-when-cross-origin"/);
    assert.doesNotMatch(map, /google-places\/search/);
    assert.doesNotMatch(map, /type="search"/);
    assert.match(map, /Capture from map/);
    assert.match(map, /Networking or referral/);
  });

  it("previews and explicitly maps Claffy, CSV, TSV, and XLSX columns", () => {
    assert.match(importer, /Claffy, networking, directory, CSV, TSV, or XLSX/);
    assert.match(importer, /guessedMapping/);
    assert.match(importer, /Approve mapping and import/);
    assert.match(handlers, /allowedMappingTargets/);
    assert.match(handlers, /Each spreadsheet column must map to a different prospect field/);
  });

  it("keeps imported rows available to both optional research and immediate outreach", () => {
    assert.match(handlers, /qualificationState: "unreviewed"/);
    assert.match(importer, /immediately available in both Researching and Outreach Command/);
    assert.match(read("src/app/portal/clients/_PeopleHub.tsx"), /href="\/portal\/agency\/scouting\?import=1"/);
    assert.match(read("src/app/portal/agency/scouting/page.tsx"), /initialImportOpen=\{rawImport === "1"\}/);
  });

  it("keeps every imported candidate reachable through bounded search and pages", () => {
    const prospects = Array.from({ length: 29 }, (_, index) => ({
      id: `prospect-${index + 1}`,
      name: `Person ${index + 1}`,
      company: `Business ${index + 1}`,
      email: `person-${index + 1}@example.test`,
      phone: `07000${String(index + 1).padStart(5, "0")}`,
      website: `https://business-${index + 1}.example.test`,
      address: `${index + 1} High Street`,
      niche: index === 27 ? "Marine architecture" : "Services",
      source: "csv:claffy.csv",
      foundAt: "Claffy",
      tags: index === 28 ? ["priority-account"] : ["imported"],
    }));

    assert.deepEqual(
      paginateScoutingIntake(prospects, "", 0).items.map(item => item.id),
      prospects.slice(0, 12).map(item => item.id),
    );
    assert.deepEqual(
      paginateScoutingIntake(prospects, "", 2).items.map(item => item.id),
      prospects.slice(24).map(item => item.id),
      "the oldest tail of a 29-row import must remain reachable",
    );
    assert.equal(paginateScoutingIntake(prospects, "", 999).page, 2, "shrinking results clamp the current page");
    assert.deepEqual(paginateScoutingIntake(prospects, "marine", 0).items.map(item => item.id), ["prospect-28"]);
    assert.deepEqual(paginateScoutingIntake(prospects, "priority-account", 0).items.map(item => item.id), ["prospect-29"]);

    const workspace = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
    assert.match(workspace, /paginateScoutingIntake\(prospects, query, page\)/);
    assert.match(workspace, /type="search"/);
    assert.match(workspace, /aria-label="Captured candidate pages"/);
    assert.match(workspace, />\s*Previous\s*</);
    assert.match(workspace, />\s*Next\s*</);
    assert.doesNotMatch(workspace, /prospects\.slice\(0, 8\)/);
  });
});

describe("Outreach Command is deliberate, mode-specific, and ledger-backed", () => {
  const command = read("src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");

  it("offers Power Dialler, Email, and Pipeline modes over the active queue", () => {
    assert.match(command, /> Power dialler</);
    assert.match(command, /> Email</);
    assert.match(command, /> Pipeline</);
    assert.match(command, /view === "power-dialler"/);
    assert.match(command, /view === "email"/);
    assert.match(command, /view === "pipeline"/);
  });

  it("keeps provider actions one recipient at a time and blocks blind advancement", () => {
    assert.match(command, /never auto-dials or bulk-sends/i);
    assert.match(command, /<CallButton/);
    assert.match(command, /<EmailButton/);
    assert.match(command, /providerPending \|\| !readyForNext \|\| modeProspects\.length < 2/);
    assert.match(command, /attemptId: activeAttemptId/);
    assert.match(command, /selectedProspectIdRef\.current !== prospectId/);
    assert.match(command, /const outreachLocked = providerPending !== null \|\| heldProviderReceipt/);
    assert.match(command, /onPendingChange=\{pending => onProviderPendingChange\(selected\.id, "call", pending\)\}/);
    assert.match(command, /onPendingChange=\{pending => onProviderPendingChange\(selected\.id, "email", pending\)\}/);
    assert.match(command, /setReadyForNext\(false\);\s+setActiveAttemptId\(undefined\);\s+setHeldProviderReceipt\(false\);\s+setProviderPending/);
    assert.match(command, /disabled=\{outreachLocked\}/);
    assert.match(command, /Channel is locked to the provider receipt until this attempt is finalised/);
    assert.doesNotMatch(command, /href=[^\n]*sms:/);
    assert.doesNotMatch(command, /href=[^\n]*wa\.me/);
  });

  it("exposes the existing Journey Contacts screen rather than another contact page", () => {
    const sidebar = read("src/lib/chrome/sidebarLayout.ts");
    const people = read("src/app/portal/clients/_PeopleHub.tsx");
    assert.match(sidebar, /id: "contacts", label: "Contacts", href: "\/portal\/clients\?view=contacts"/);
    assert.doesNotMatch(people, /href=\{`(?:tel|mailto):/,
      "Contacts and Leads must not bypass suppression and audit with raw contact links");
    assert.match(people, /prospecting\?lead=\$\{encodeURIComponent\(pipelineLeadId\)\}&mode=power-dialler/);
    assert.match(people, /Protected contact controls/);
  });

  it("keeps research, call playbooks, staff attribution, and last conversation in the contact context", () => {
    const projection = read("src/app/portal/agency/pipelines/[slug]/_scoutingProspectView.ts");
    const journeyServer = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx");
    const journeyProjection = read("src/app/portal/agency/pipelines/[slug]/_leadJourneyProjection.ts");
    const journeyTrace = read("src/app/portal/agency/pipelines/[slug]/_leadShared.tsx");
    const focusedServer = read("src/app/portal/agency/scouting/_ScoutingWorkspaceServer.tsx");
    const sopPage = read("src/app/portal/agency/sop-library/page.tsx");
    assert.match(command, /Research brief/);
    assert.match(command, /sop-library\?query=call/);
    assert.match(command, /Last conversation/);
    assert.match(command, /Outreach plan & callbacks/);
    assert.match(command, /Research updated/);
    assert.match(command, /resolverActorLabel \?\? item\.actorLabel/);
    assert.match(command, /Qualify to Journey[\s\S]*open the meeting record[\s\S]*time, format, preparation, link, and reminders/);
    assert.match(command, /selected\.status === "qualified" && selected\.qualifiedLeadId[\s\S]*#lead-record/);
    assert.match(command, /\{item\.kind === "attempt" \? "started by" : "by"\} \{item\.actorLabel\}/);
    assert.match(command, /outcome by \{item\.finaliserActorLabel\}/);
    assert.match(command, /actor not recorded/);
    assert.match(projection, /actorLabel: actorLabelFor\(item\.actorUserId\)/);
    assert.match(projection, /actorLabel: actorLabelFor\(item\.createdBy\)/);
    assert.match(projection, /resolverActorLabel: actorLabelFor\(item\.resolvedBy\)/);
    assert.match(projection, /researchActorLabel: actorLabelFor\(prospect\.researchUpdatedBy\)/);
    assert.match(journeyServer, /getUserById\(actorUserId\)/);
    assert.match(journeyServer, /map\(\(\{ actorUserId, outcomeActorUserId, \.\.\.event \}\) => \(\{/);
    assert.match(journeyServer, /actorLabel: actorLabelFor\(actorUserId\)/);
    assert.match(journeyServer, /outcomeActorLabel: actorLabelFor\(outcomeActorUserId\)/);
    assert.doesNotMatch(journeyServer, /\.\.\.event,[\s\S]{0,120}actorUserId:/,
      "raw actor ids must not be projected into the client Journey model");
    assert.match(journeyServer, /lead\.prospectAcquisitions \?\? \[\]/);
    assert.match(journeyServer, /acquisitionJourneyEvents\(acquisition, actorLabelFor\)/);
    assert.match(journeyProjection, /actorLabelFor\(acquisition\.qualifiedByUserId\)/);
    assert.match(journeyProjection, /actorLabelFor\(acquisition\.research\.researchUpdatedBy\)/);
    assert.match(journeyProjection, /actorLabelFor\(followUp\.resolvedBy\)/);
    assert.match(journeyTrace, /Recorded by \{event\.actorLabel\}/);
    assert.match(journeyTrace, /Qualified into Journey/);
    assert.match(journeyTrace, /Research updated/);
    assert.match(focusedServer, /getUserById\(actorUserId\)/);
    assert.match(sopPage, /initialQuery=\{initialQuery\}/);
  });
});

describe("Journey is the master acquisition board", () => {
  it("loads active Prospects beside Leads and renders them in the scouting column", () => {
    const server = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx");
    const directJourney = read("src/app/portal/agency/pipelines/[slug]/page.tsx");
    const workspace = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
    assert.match(server, /container\.prospects\.list\(\)/);
    assert.match(server, /status === "scouting"/);
    assert.match(server, /toScoutingProspectView/);
    assert.match(directJourney, /prospects\.list\(\)/);
    assert.match(directJourney, /toScoutingProspectView\(prospect, actorLabelFor\)/);
    assert.match(directJourney, /acquisitionJourneyEvents\(acquisition, actorLabelFor\)/);
    assert.match(workspace, /col\.id === "scouting"/);
    assert.match(workspace, /<ProspectCard/);
    assert.match(workspace, /Recommended next action/);
    assert.doesNotMatch(workspace, /href=\{`(?:tel|mailto):/,
      "Journey must hand contact to the protected outreach desk");
    assert.match(workspace, /prospecting\?lead=\$\{encodeURIComponent\(lead\.id\)\}&mode=power-dialler/);
    assert.match(workspace, /researching\?lead=\$\{encodeURIComponent\(lead\.id\)\}/);
    assert.match(workspace, /latestOutreach\?\.outcome === "meeting-booked"[\s\S]*#lead-record/,
      "qualifying a booked meeting should open its meeting record instead of making the operator find it again");
  });

  it("keeps the acquisition tabs visible through Inbox and Contacts", () => {
    assert.match(read("src/app/portal/agency/inbox/page.tsx"), /<SalesAcquisitionTabs active="inbox"/);
    assert.match(read("src/app/portal/clients/page.tsx"), /<SalesAcquisitionTabs active="contacts"/);
  });

  it("keeps the acquisition strip above every Owner Journey desk without duplicating it in Pipeline", () => {
    const journey = read("src/app/portal/clients/_JourneyCommercialWorkspace.tsx");
    const clientsPage = read("src/app/portal/clients/page.tsx");
    const pipeline = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
    assert.match(journey, /<SalesAcquisitionTabs active="journey" \/>/);
    assert.match(clientsPage, /<LeadsPipelineWorkspaceServer[^>]*showAcquisitionTabs=\{false\}/);
    assert.match(pipeline, /showAcquisitionTabs \? <SalesAcquisitionTabs/);
  });

  it("uses explicit promotion lineage, not shared email addresses, to collapse Journey people", () => {
    const clientsPage = read("src/app/portal/clients/page.tsx");
    assert.match(clientsPage, /meetingPromotedLeadIds\.has\(lead\.id\)/);
    assert.match(clientsPage, /promotedLeadIds\.has\(lead\.id\)/);
    assert.match(clientsPage, /contact\.recordKind === person\.kind && contact\.id === person\.id/);
    assert.doesNotMatch(clientsPage, /meetingContactEmails/);
  });

  it("lets only future non-terminal meetings suppress the outreach recommendation", () => {
    const workspace = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
    const server = read("src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspaceServer.tsx");
    assert.match(workspace, /selectOperationalUpcomingMeetings\(journeyMeetings \?\? leadMeetingCandidates/);
    assert.match(workspace, /const meetings = operationalUpcomingMeetings\.length/);
    assert.match(workspace, /referenceNow=\{clock\}/);
    assert.doesNotMatch(workspace, /tags\.some\(t => \/meeting\|booked\|call\/i\.test\(t\)\)/);
    assert.match(server, /loadUpcomingMeetings\(agencyId, referenceNow\)/,
      "the master prompt must include active Contact meetings as well as Leads");
  });

  it("keeps the PeopleHub view and outer acquisition strip on one URL-owned state", () => {
    const hub = read("src/app/portal/clients/_PeopleHub.tsx");
    assert.match(hub, /useEffect\(\(\) => setView\(initialView\), \[initialView\]\)/);
    assert.match(hub, /router\.push\(nextView === "clients" \? "\/portal\/clients" : `\/portal\/clients\?view=\$\{nextView\}`\)/);
  });
});
