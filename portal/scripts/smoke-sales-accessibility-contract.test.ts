// FIRST: DOM-contract checks need react-dom/server, which is unavailable under
// the canonical suite's `--conditions react-server` process.
import "./client-render-condition";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { UpcomingMeetings } from "../src/app/portal/agency/leads-pipeline/_UpcomingMeetings";
import { SalesAcquisitionTabs } from "../src/components/sales/SalesAcquisitionTabs";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

function matchingTags(markup: string, text: string): string[] {
  return markup
    .match(/<(?:a|button)\b[^>]*>[\s\S]*?<\/(?:a|button)>/g)
    ?.filter(tag => tag.includes(text)) ?? [];
}

function assertAccessibleActions(markup: string, labels: string[]) {
  for (const label of labels) {
    const tags = matchingTags(markup, label);
    assert.equal(tags.length, 1, `expected one ${label} action`);
    assert.match(tags[0]!, /min-h-11/, `${label} must expose a practical 44px target`);
    assert.match(tags[0]!, /focus-visible:/, `${label} must expose a keyboard focus indicator`);
  }
}

describe("Sales acquisition accessibility contracts", () => {
  it("renders the seven shared acquisition views as a labelled, keyboard-visible tab strip", () => {
    const markup = renderToStaticMarkup(createElement(SalesAcquisitionTabs, { active: "researching" }));
    const links = markup.match(/<a\b[^>]*>/g) ?? [];

    assert.match(markup, /<nav[^>]*aria-label="Acquisition journey views"/);
    assert.equal(links.length, 7);
    assert.equal(links.filter(link => link.includes('aria-current="page"')).length, 1);
    assert.match(markup, /aria-current="page"[^>]*>[^<]*<strong[^>]*>Researching</);
    for (const link of links) {
      assert.match(link, /min-h-16/, "each acquisition tab must remain comfortably touchable");
      assert.match(link, /focus-visible:/, "each acquisition tab needs a visible keyboard state");
    }
  });

  it("renders meeting actions with AA body copy, visible focus, and 44px targets", () => {
    const markup = renderToStaticMarkup(createElement(UpcomingMeetings, {
      referenceNow: 1_000,
      limit: 5,
      onShowAll: () => undefined,
      onOpenCommercial: () => undefined,
      meetings: [{
        id: "meeting-1",
        kind: "lead",
        name: "Ada Example",
        email: "ada@example.com",
        meetingAt: 2_000,
        meetingLink: "https://meet.example.com/room",
        notes: "Bring the discovery brief.",
        location: "Online",
        salesPresentations: [{ id: "deck-1", title: "Proposal", url: "https://example.com/proposal" }],
      }],
    }));

    assert.doesNotMatch(markup, /text-black\/55\b/);
    assertAccessibleActions(markup, [
      "Show all meetings",
      "Join meeting",
      "Proposal",
      "Prepare meeting",
      "Progress in Journey",
      "Review actions",
      "Send invoice",
    ]);
  });

  it("keeps the focused scouting and Journey cards above the low-opacity body-copy floor", () => {
    const command = read("../src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");
    const workspace = read("../src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
    const focusedStart = workspace.indexOf("function LeadInternalWorkspace");
    const focusedEnd = workspace.indexOf("function LeadWaitStrip");
    const focusedCards = workspace.slice(focusedStart, focusedEnd);
    const lowBodyCopy = /<(?:p|label|dt|dd|strong|h[1-6])\b[^>]*className="[^"]*text-black\/(?:35|38|40|42|44|45|48|50)\b/;

    assert.ok(focusedStart >= 0 && focusedEnd > focusedStart, "focused Journey card source must be discoverable");
    assert.doesNotMatch(command, lowBodyCopy);
    assert.doesNotMatch(focusedCards, lowBodyCopy);
    assert.ok((command.match(/focus-visible:/g) ?? []).length >= 25, "Scouting needs keyboard-visible states across its action-heavy workbench");
    assert.ok((command.match(/min-h-11/g) ?? []).length >= 20, "Scouting primary controls should retain practical touch targets");
    assert.ok((focusedCards.match(/focus-visible:/g) ?? []).length >= 20, "focused Journey cards need keyboard-visible actions");
    assert.ok((focusedCards.match(/min-h-11/g) ?? []).length >= 20, "focused Journey cards should retain practical touch targets");
  });

  it("keeps one acquisition tab strip above a focused Journey lead", () => {
    const workspace = read("../src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
    const branchStart = workspace.indexOf('if (workspaceMode === "journey" && focusedLeadId)');
    const normalWorkspaceStart = workspace.indexOf('data-testid={workspaceMode === "journey" ? "leads-workspace"', branchStart);
    const focusedBranch = workspace.slice(branchStart, normalWorkspaceStart);

    assert.ok(branchStart >= 0 && normalWorkspaceStart > branchStart, "focused Journey branch must be discoverable");
    assert.equal((focusedBranch.match(/<SalesAcquisitionTabs\b/g) ?? []).length, 1,
      "a focused lead must keep exactly one acquisition strip");
    assert.match(focusedBranch, /showAcquisitionTabs \? <SalesAcquisitionTabs active="journey" \/> : null/,
      "the embedded Journey strip must retain its owner-controlled visibility gate");
  });

  it("gives the People Hub scratchpad a complete modal keyboard contract", () => {
    const hub = read("../src/app/portal/clients/_PeopleHub.tsx");
    const dialogStart = hub.indexOf("function ContactScratchpad");
    const dialogEnd = hub.indexOf("function Badge", dialogStart);
    const dialog = hub.slice(dialogStart, dialogEnd);

    assert.ok(dialogStart >= 0 && dialogEnd > dialogStart, "contact scratchpad source must be discoverable");
    assert.match(dialog, /const dialogRef = useRef<HTMLFormElement>\(null\)/);
    assert.match(dialog, /useFocusTrap\(dialogRef, true, \{ onEscape: busy \? undefined : onClose \}\)/,
      "the shared trap supplies Tab containment, Escape and focus return");
    assert.match(dialog, /ref=\{dialogRef\} role="dialog" aria-modal="true" aria-labelledby="contact-scratchpad-title"/);
    assert.match(dialog, /<h2 id="contact-scratchpad-title"/);
    assert.match(dialog, /aria-label="Close" className="grid size-11[^\"]*focus-visible:ring/);
    assert.match(dialog, />Cancel<\/button><button[^>]*min-h-11[^>]*focus-visible:ring/);
  });

  it("keeps People Hub and enquiry actions touchable, focus-visible and readable", () => {
    const hub = read("../src/app/portal/clients/_PeopleHub.tsx");
    const enquiry = read("../src/app/portal/agency/inbox/_EnquiryDetailCard.tsx");
    const undersizedStaticAction = /<(?:button|a|Link)\b[^\n]*className="[^"]*(?:min-h-(?:7|8|9|10)|size-(?:7|8|9|10))\b/;
    const lowInformativeCopy = /<(?:p|label|dt|h[1-6]|span)\b[^>]*className="[^"]*text-black\/(?:35|38|40|42|44|45|48|50|55|58|60|62)\b/;

    assert.doesNotMatch(hub, undersizedStaticAction);
    assert.doesNotMatch(enquiry, undersizedStaticAction);
    assert.doesNotMatch(hub, lowInformativeCopy);
    assert.doesNotMatch(enquiry, lowInformativeCopy);
    assert.match(hub, /Open workspace[\s\S]{0,120}focus-visible:|focus-visible:[\s\S]{0,120}Open workspace/);
    assert.match(hub, /Protected contact controls[\s\S]{0,160}focus-visible:|focus-visible:[\s\S]{0,160}Protected contact controls/);
    assert.match(enquiry, /Mark reviewed[\s\S]{0,220}focus-visible:|focus-visible:[\s\S]{0,220}Mark reviewed/);
    assert.match(enquiry, /Save details[\s\S]{0,220}focus-visible:|focus-visible:[\s\S]{0,220}Save details/);
  });

  it("hardens the map, importer, Journey board, meetings and Contacts hand-off at narrow breakpoints", () => {
    const map = read("../src/app/portal/agency/pipelines/[slug]/_GoogleBusinessScout.tsx");
    const importer = read("../src/app/portal/agency/pipelines/[slug]/_ProspectImportDialog.tsx");
    const command = read("../src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");
    const workspace = read("../src/app/portal/agency/pipelines/[slug]/_LeadsPipelineWorkspace.tsx");
    const meetings = read("../src/app/portal/clients/_JourneyMeetingsWorkspace.tsx");
    const contacts = read("../src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx");
    const personCardStart = contacts.indexOf("function PersonCard");
    const personCardEnd = contacts.indexOf("function DetailsEditor");
    const personCard = contacts.slice(personCardStart, personCardEnd);
    const lowInformativeCopy = /<(?:p|label|dt|dd|strong|h[1-6]|span)\b[^>]*className="[^"]*text-black\/(?:35|38|40|42|44|45|48|50|55|60)\b/;
    const undersizedStaticAction = /<(?:button|summary|select|a|Link)\b[^>]*className="[^"]*(?:min-h-(?:7|8|9|10)|size-(?:7|8|9|10))\b/;

    assert.ok(personCardStart >= 0 && personCardEnd > personCardStart, "Contacts acquisition card source must be discoverable");
    assert.ok((map.match(/min-h-11/g) ?? []).length >= 5, "map actions need a 44px target floor");
    assert.ok((map.match(/focus-visible:/g) ?? []).length >= 5, "map actions need visible keyboard focus");
    assert.match(importer, /type="file"/);
    assert.match(importer, /className="mt-3 block min-h-11[^"]*text-black\/65[^"]*focus-visible:ring/);
    assert.match(importer, /file:min-h-11/);
    assert.match(command, /className="mt-2 grid gap-2 sm:grid-cols-3"/,
      "callback shortcuts must stack rather than overlap on narrow screens");
    assert.match(workspace, /aria-label="Pipeline board, scrolls horizontally"[\s\S]{0,180}focus-visible:ring/);
    assert.match(workspace, /<summary className="[^"]*min-h-11[^"]*focus-visible:[^"]*">\s*Actions/);
    assert.doesNotMatch(workspace, undersizedStaticAction);
    assert.doesNotMatch(workspace, lowInformativeCopy);
    assert.match(meetings, /role="img" aria-label="Needs attention"/);
    assert.match(meetings, /<footer className="flex flex-wrap items-center justify-end/);
    assert.doesNotMatch(meetings, lowInformativeCopy);
    assert.match(personCard, /flex flex-wrap items-start justify-between/);
    assert.match(personCard, /Prepare outreach[\s\S]{0,500}focus-visible:|focus-visible:[\s\S]{0,500}Prepare outreach/);
    assert.doesNotMatch(personCard, lowInformativeCopy);
  });

  it("describes ordinary external links honestly and keeps meeting contact routes inside guarded CRM workspaces", () => {
    const command = read("../src/app/portal/agency/pipelines/[slug]/_ScoutingCommand.tsx");
    const meetings = read("../src/app/portal/clients/_JourneyMeetingsWorkspace.tsx");

    assert.doesNotMatch(command, /protected (?:browser )?tab|protected pair|protected command queue/i);
    assert.match(command, /separate browser tab/);

    assert.doesNotMatch(meetings, /href=\{`(?:mailto|tel):/);
    assert.match(meetings, /prospecting\?lead=\$\{encodeURIComponent\(person\.id\)\}&mode=email/);
    assert.match(meetings, /prospecting\?lead=\$\{encodeURIComponent\(person\.id\)\}&mode=power-dialler/);
    assert.match(meetings, /const contactControlsHref = "\/portal\/agency\/leads-pipeline\/contacts"/);
    assert.match(meetings, /const presentationLinks = \(person\.salesPresentations \?\? \[\]\)\.flatMap/);
    assert.match(meetings, /safeMeetingAssetUrl\(asset\.url\)/);
    assert.match(meetings, /presentationLinks\.map\(asset => <a key=\{asset\.id\} href=\{asset\.href\}/);
    assert.doesNotMatch(meetings, /href=\{asset\.url\}/);
  });

  it("keeps the shared call and email controls keyboard-visible and touchable", () => {
    const call = read("../src/components/telephony/CallControls.tsx");
    const email = read("../src/components/telephony/EmailControls.tsx");
    for (const [name, source] of [["call", call], ["email", email]] as const) {
      assert.doesNotMatch(source, /min-h-(?:7|8|9|10)\b/, `${name} controls contain a sub-44px target`);
      assert.ok((source.match(/min-h-11/g) ?? []).length >= 2, `${name} controls lost their practical target floor`);
      assert.ok((source.match(/focus-visible:/g) ?? []).length >= 2, `${name} controls lost visible keyboard focus`);
    }
  });
});
