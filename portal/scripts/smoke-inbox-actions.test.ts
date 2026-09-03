// Inbox + Actions unification smoke.
//
// Pins the merged contract from
// docs/development/plans/inbox-actions-unification.md:
//   • the Master Inbox tab bar carries an "Actions" tab (view="actions") that
//     renders a server-rendered slot;
//   • inbox/page.tsx feeds that slot with the real AgencyActionsPage;
//   • the sidebar has ONE "Inbox & actions" item, not a separate Actions row;
//   • the old /portal/agency/actions route redirects onto the inbox tab so the
//     many existing links across the app still land correctly.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildSidebar } from "../src/lib/chrome/sidebarLayout";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

const MASTER_INBOX = read("src", "app", "portal", "agency", "inbox", "_MasterInbox.tsx");
const INBOX_PAGE = read("src", "app", "portal", "agency", "inbox", "page.tsx");
const ACTIONS_PAGE = read("src", "app", "portal", "agency", "actions", "page.tsx");
const SIDEBAR = read("src", "lib", "chrome", "sidebarLayout.ts");

describe("inbox + actions unification", () => {
  it("Master Inbox has an Actions tab that renders a server slot", () => {
    // The view union and the deep-link parser both admit "actions".
    assert.match(MASTER_INBOX, /"actions"/, "the View type / parser must admit actions");
    assert.match(
      MASTER_INBOX,
      /requestedView === "actions"/,
      "?view=actions must initialise the view like the other tabs",
    );
    // MERGED 2026-08-30 — a deliberate reversal, not a regression.
    //
    // Ed: *"merge needs attention and actions please!!!"* They were always one
    // job — a signal, and the queue of work that signal creates — and splitting
    // them across two tabs meant resolving something required remembering which
    // half it lived in.
    //
    // What this test still guarantees is unchanged: the Actions workspace
    // arrives as a SERVER-RENDERED SLOT and is never imported into this client
    // component. Only the trigger moved, from its own tab to the merged one.
    assert.match(MASTER_INBOX, /"needs-you"/,
      "the merged tab is gone — attention and actions have been split again");
    assert.match(MASTER_INBOX, /actions: "needs-you"/,
      "?view=actions no longer maps to a tab, so /portal/agency/actions redirects nowhere");
    assert.match(MASTER_INBOX, /actionsSlot/, "MasterInbox must accept an actionsSlot prop");
    assert.match(
      MASTER_INBOX,
      /tab === "needs-you" \? actionsSlot/,
      "the slot must render on the merged tab",
    );
    // It stays a client component and never imports the server ActionsPage.
    assert.match(MASTER_INBOX, /^"use client";/, "MasterInbox stays a client component");
    assert.doesNotMatch(
      MASTER_INBOX,
      /_ActionsPage/,
      "the server ActionsPage must never be imported into the client component",
    );
  });

  it("inbox/page.tsx feeds the slot with the real AgencyActionsPage", () => {
    assert.match(
      INBOX_PAGE,
      /import\s*\{\s*AgencyActionsPage\b[\s\S]*?from\s*"\.\.\/actions\/_ActionsPage"/,
      "inbox page must import AgencyActionsPage from the actions module",
    );
    // Reshaped 2026-08-30: the page now assembles the actions ONCE and feeds
    // both the slot and the Needs-you badge (Ed: "it says 0 but theres actions
    // in there"). The guarantee is identical — a showcase session gets a null
    // slot and a zero count — it is just expressed through `preparedActions`.
    assert.match(
      INBOX_PAGE,
      /const preparedActions = session\.publicShowcase \? null : await assembleAgencyActions\(\);/,
      "the showcase null-slot guarantee has moved or gone",
    );
    assert.match(
      INBOX_PAGE,
      // 2026-09-03: the slot is also gated on the actor's Actions element, so a
      // seat without `workspace.actions` gets the same null slot a showcase does.
      /actionsSlot=\{preparedActions\?\.actionsAvailable \? <AgencyActionsPage prepared=\{preparedActions\} \/> : null\}/,
      "inbox page must pass AgencyActionsPage outside the read-only public showcase",
    );
    assert.match(
      INBOX_PAGE,
      /openActionCount=\{preparedActions\?\.actionsAvailable \? preparedActions\.openActionCount : 0\}/,
      "the Needs-you badge no longer receives the actions count — it will read 0 with a full queue again",
    );
  });

  it("the actions route is a real Actions-only destination again (2026-09-03)", () => {
    // Reversed with the personal/business Radar split: a seat granted
    // `workspace.actions` but not `workspace.inbox` must reach their tasks
    // without the combined Inbox serialising conversations and enquiries that
    // belong to a separately configurable element. So /actions renders the same
    // component the Inbox slot uses, and no longer redirects into the Inbox.
    assert.match(ACTIONS_PAGE, /return <AgencyActionsPage \/>;/, "actions page must render the shared Actions component");
    assert.doesNotMatch(ACTIONS_PAGE, /redirect\(/, "actions page must not redirect a narrowed seat into the Inbox");
  });

  it("the sidebar merges Inbox + Actions into one item", () => {
    // Source: the merged label exists and there is no separate Actions nav row.
    assert.match(SIDEBAR, /label:\s*"Inbox & actions"/, "the merged nav item must be labelled Inbox & actions");
    assert.doesNotMatch(
      SIDEBAR,
      /href:\s*"\/portal\/agency\/actions"/,
      "no nav item may point at the retired /portal/agency/actions route",
    );
    assert.doesNotMatch(
      SIDEBAR,
      /id:\s*"actions",\s*label:/,
      "the separate Actions nav item must be gone",
    );

    // Behaviour: the assembled agency sidebar has exactly one inbox row and no
    // actions row, and the inbox row still targets /portal/agency/inbox.
    const panels = buildSidebar({ role: "agency-owner", scope: "agency", installedPlugins: [] });
    const items = panels.flatMap(panel => panel.items);
    const inboxItems = items.filter(item => item.id === "inbox");
    assert.equal(inboxItems.length, 1, "exactly one merged inbox row");
    assert.equal(inboxItems[0]!.href, "/portal/agency/inbox", "the merged row still opens the inbox");
    assert.equal(inboxItems[0]!.label, "Inbox & actions", "the merged row is labelled Inbox & actions");
    assert.equal(items.filter(item => item.id === "actions").length, 0, "no standalone Actions row survives");
    assert.equal(
      items.filter(item => item.href === "/portal/agency/actions").length,
      0,
      "nothing in the sidebar links to the retired actions route",
    );
  });
});
