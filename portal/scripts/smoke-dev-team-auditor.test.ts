// Dev Team → Auditor smoke — the section that must never mislabel a live
// problem as closed.
//
// The auditor view is the one screen whose entire job is to surface what a green
// suite hides. Three ways it was lying, each pinned here:
//
//   1. RECENCY — the ✅ RESOLVED banner ledger at the top of audits.md is
//      permanent, carries no position in the timeline, and was closing ANY 🔴
//      about the same subject, including ones written after it. A regression
//      re-opened next month rendered as "Historical — closed by a later ✅ PASS".
//   2. TITLES — the auditor's house style puts em-dashes inside the bold label
//      (`**RESOLVED (2026-08-19, auditor — tick 16)**`), so splitting on the
//      first em-dash leaked the label into the headline and swallowed the whole
//      evidence paragraph as the "title" — which also handed the subject matcher
//      a vocabulary wide enough to match almost any related rework.
//   3. COUNTS — the header pill counted the banner ledger only, so it read a
//      green "All clear" above a red list of unresolved 🔴 rulings.
//
// Plus the layered founder gate on every Dev Team section body, and the fact
// that launch readiness must be judged on the same inputs Settings uses (env
// vars AND providers connected through the credential vault).

import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";

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

const read = (rel: string) => readFile(new URL(`../${rel}`, import.meta.url), "utf8");

type Auditor = typeof import("../src/lib/server/dev/devTeamAuditor");
type Storage = typeof import("../src/server/storage");
type Tenants = typeof import("../src/server/tenants");
type Connections = typeof import("../src/lib/server/integrations/integrationConnections");

let auditor: Auditor;
let storage: Storage;
let tenants: Tenants;
let connections: Connections;

before(async () => {
  // In-memory backend — this suite must never touch the real portal state file.
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_VAULT_ENCRYPTION_KEY = "auditor-smoke-vault-key-longer-than-thirty-two-characters";
  delete process.env.OPENAI_API_KEY; // the point is a vault connection, not an env key
  auditor = await import("../src/lib/server/dev/devTeamAuditor");
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  connections = await import("../src/lib/server/integrations/integrationConnections");
  await storage.ensureHydrated();
  await storage.reset();
});

// The auditor's real house style: a dated bold label, an em-dash inside it, a
// headline sentence, then a paragraph of evidence.
const CLEARED_BANNER =
  "> ✅ **RESOLVED (2026-08-19, auditor — tick 16)** — the client erasure PII hole is closed: promote and update no longer leak email or phone. "
  + "The hook was in fact a total no-op (it filtered on `Contact.clientId`, which nothing writes) — the builder fixed it to resolve the client's "
  + "people via the real links and strip every value, and added a test that drives the real upsert flow. 18/18 isolated.";

const REGRESSION_TITLE =
  "Erasure: the client PII hole is back, promote and update leak email again";

function logWith(entryDate: string): string {
  return [
    "# Audit log",
    "",
    CLEARED_BANNER,
    "",
    "_Verdicts below, newest first._",
    "",
    `## ${entryDate} — 🔴 REWORK — ${REGRESSION_TITLE}`,
    "",
    "**Verdict:** 🔴 REWORK — the PII is written again on the create path.",
  ].join("\n");
}

describe("dev team auditor — a cleared banner cannot close a later ruling", () => {
  it("leaves a 🔴 written AFTER the banner unresolved", () => {
    // The banner is dated 2026-08-19; this ruling is two days newer. The ledger
    // is a permanent record, so without a recency guard it closes this forever.
    const findings = auditor.parseAuditFindings(logWith("2026-08-21"));
    const entry = findings.find(f => f.source === "entry");
    assert.ok(entry, "the 🔴 ruling is a finding");
    assert.equal(entry!.title, REGRESSION_TITLE);
    assert.equal(
      entry!.supersededBy,
      undefined,
      "a 2026-08-19 cleared banner must not close a 2026-08-21 ruling",
    );
  });

  it("still closes a ruling the banner is not older than, and names its date", () => {
    // The guard must not kill the feature: a banner may still close a ruling
    // that predates it — that is the auditor's documented way of recording a
    // resolution. Without this case the test above would pass on a broken
    // "banners never close anything" implementation too.
    const findings = auditor.parseAuditFindings(logWith("2026-08-18"));
    const entry = findings.find(f => f.source === "entry");
    assert.ok(entry?.supersededBy, "a cleared banner still closes an EARLIER ruling");
    assert.match(entry!.supersededBy!.verdict, /✅/);
    assert.equal(
      entry!.supersededBy!.date,
      "2026-08-19",
      "the closer names the banner's own date, so the claim can be checked",
    );
  });

  it("ignores an UNDATED banner entirely — it cannot be placed in the timeline", () => {
    const undated = logWith("2026-08-18").replace("RESOLVED (2026-08-19, auditor — tick 16)", "RESOLVED (auditor)");
    const entry = auditor.parseAuditFindings(undated).find(f => f.source === "entry");
    assert.ok(entry, "the ruling is still a finding");
    assert.equal(
      entry!.supersededBy,
      undefined,
      "a banner with no date can never be shown to be newer, so it closes nothing",
    );
  });

  it("matches on the banner headline, not its evidence paragraph", () => {
    // The evidence paragraph is prose about the fix; letting it into the subject
    // match gives a ~70-token vocabulary that swallows unrelated rework.
    const log = [
      "# Audit log",
      "",
      "> ✅ **RESOLVED (2026-08-19, auditor)** — Freelancer preview escalation is closed. "
      + "The plugin data erasure runtime sweep, the leads pipeline key-PII scrub and the per-disposition test all ran clean alongside it.",
      "",
      "## 2026-08-18 — 🔴 REWORK — Plugin-data erasure: the runtime sweep, leads pipeline key-PII scrub and per-disposition test",
      "",
      "**Verdict:** 🔴 REWORK — the sweep never runs.",
    ].join("\n");
    const entry = auditor.parseAuditFindings(log).find(f => f.source === "entry");
    assert.ok(entry, "the rework is a finding");
    assert.equal(
      entry!.supersededBy,
      undefined,
      "a banner about a different subject must not close this ruling just because its evidence paragraph mentions it",
    );
  });
});

describe("dev team auditor — banner titles are the headline, not the label", () => {
  it("splits after the bold label, so the parenthetical dash does not leak in", () => {
    const banner = auditor.parseAuditFindings(logWith("2026-08-21")).find(f => f.source === "banner");
    assert.ok(banner, "the ledger banner is parsed");
    assert.equal(banner!.verdict, "✅ RESOLVED", "the verdict phrase still comes from the label");
    assert.equal(banner!.resolved, true);
    assert.equal(banner!.date, "2026-08-19", "the label's date is the banner's date");

    // The old split landed on the em-dash INSIDE "(2026-08-19, auditor — tick 16)".
    assert.ok(!/^tick/.test(banner!.title), `title must not start mid-label: ${banner!.title}`);
    assert.ok(!/RESOLVED|auditor/i.test(banner!.title), `the label must not leak into the title: ${banner!.title}`);
    assert.match(banner!.title, /^the client erasure PII hole is closed/);

    // One headline, not the whole paragraph — both banner lists render it raw.
    assert.ok(banner!.title.length < 200, `headline is a headline, not a paragraph (${banner!.title.length} chars)`);
    // Nothing is lost: the evidence moves to detail.
    assert.match(banner!.detail ?? "", /total no-op/);
    assert.match(banner!.detail ?? "", /18\/18 isolated/);
  });

  it("still handles a plain banner with no bold label", () => {
    const log = ["# Audit log", "", "> 🔴 REWORK — the connect-flow codes are never emailed.", ""].join("\n");
    const banner = auditor.parseAuditFindings(log).find(f => f.source === "banner");
    assert.equal(banner?.verdict, "🔴 REWORK");
    assert.equal(banner?.resolved, false);
    assert.equal(banner?.title, "the connect-flow codes are never emailed.");
  });
});

describe("dev team auditor — the header pill counts everything still open", () => {
  it("counts unresolved rulings, not just the banner ledger", () => {
    // The shape that produced the lie: no open banners (so "0 open now"), but
    // rulings below with no recorded resolution.
    const log = [
      "# Audit log",
      "",
      "> ✅ **RESOLVED (2026-08-19, auditor)** — Freelancer preview escalation is closed.",
      "",
      "## 2026-08-19 — 🔴 HELD — Erasure: email-in-LOG still open",
      "",
      "**Verdict:** 🔴 HELD.",
      "",
      "## 2026-08-19 — 🔴 REWORK — Plugin-data erasure Phase 2: the runtime sweep",
      "",
      "**Verdict:** 🔴 REWORK.",
    ].join("\n");
    const findings = auditor.parseAuditFindings(log);
    assert.equal(findings.filter(f => f.source === "banner" && !f.resolved).length, 0, "no open banners");
    assert.equal(
      auditor.countStillOpenFindings(findings),
      2,
      "two rulings with no recorded resolution are still open, whatever the ledger says",
    );
  });

  it("is zero only when the ledger AND the rulings are clear", () => {
    const clean = ["# Audit log", "", "> ✅ **RESOLVED (2026-08-19, auditor)** — everything is closed.", ""].join("\n");
    assert.equal(auditor.countStillOpenFindings(auditor.parseAuditFindings(clean)), 0);
  });

  it("wires that count into the header pill, so 'All clear' needs both to be zero", async () => {
    const section = await read("src/app/portal/dev-team/auditor/_Section.tsx");
    assert.match(section, /countStillOpenFindings\(findings\)/, "the section uses the shared rule");
    // "All clear" may only appear on the zero branch of the total.
    assert.match(section, /stillOpenCount > 0 \? `\$\{stillOpenCount\} open` : "All clear"/);
    // The banner-only number keeps its own, narrower label.
    assert.match(section, /\{openCount\} open now/);
    // …and that zero is not dressed up as good news while rulings are unresolved.
    assert.match(section, /openCount > 0 \? "danger" : unresolvedEntries\.length > 0 \? "muted" : "ok"/);
    // Long banner headlines are truncated in both banner lists.
    assert.equal(
      (section.match(/truncate\(f\.title, 160\)/g) ?? []).length,
      2,
      "both 'Open now' and 'Recently cleared' truncate the headline",
    );
  });
});

describe("dev team auditor — readiness sees vault-connected providers", () => {
  it("reports the assistant ready when OpenAI is connected in-app, with no env key", async () => {
    const agency = tenants.createAgency({ name: "Auditor Readiness", slug: "auditor-readiness" });
    connections.saveIntegrationConnection({
      agencyId: agency.id,
      provider: "openai",
      label: "OpenAI",
      values: { apiKey: "sk-auditor-smoke-key", model: "gpt-5.4-mini" },
      actorUserId: "owner",
    });

    const context = auditor.readinessContextForAgency(agency.id);
    assert.deepEqual(context.managedIntegrationProviders, ["openai"], "the vault connection is in the context");

    const audit = await auditor.scanDevTeamAudit(context);
    const assistant = audit.readiness.items.find(item => item.id === "assistant");
    assert.equal(
      assistant?.status,
      "ready",
      "a provider connected through the credential vault is as real as an env key",
    );

    // The bug: scanning with no context is blind to every in-app connection, so
    // the Auditor and Settings would report the same provider differently.
    const blind = await auditor.scanDevTeamAudit();
    assert.equal(
      blind.readiness.items.find(item => item.id === "assistant")?.status,
      "optional",
      "…which is exactly what the auditor used to do",
    );
  });

  it("carries the workspace counts Settings uses", async () => {
    const agency = tenants.createAgency({ name: "Auditor Counts", slug: "auditor-counts" });
    tenants.createClient(agency.id, { name: "Billing Client", metadata: { stripeLink: "https://buy.stripe.com/test" } });
    tenants.createClient(agency.id, { name: "Unbilled Client" });

    const context = auditor.readinessContextForAgency(agency.id);
    assert.equal(context.activeClientCount, 2);
    assert.equal(context.billingConfiguredClientCount, 1);
    assert.equal(context.activeExternalAssistantKeyCount, 0);
  });
});

describe("dev team — every section body re-asserts the founder gate", () => {
  it("gates each _Section.tsx itself, not just the layout", async () => {
    const dir = new URL("../src/app/portal/dev-team/", import.meta.url);
    const sections = readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => `src/app/portal/dev-team/${entry.name}/_Section.tsx`);

    const bodies = await Promise.all(sections.map(async rel => {
      try {
        return { rel, source: await read(rel) };
      } catch {
        return null; // not every section has a body file
      }
    }));
    const present = bodies.filter((b): b is { rel: string; source: string } => b !== null);
    assert.ok(present.length >= 6, `expected the moved section bodies to exist, found ${present.length}`);

    for (const { rel, source } of present) {
      // The layout gates too — this is the second layer, and the one that keeps
      // the contract true if a body is ever mounted outside the dev-team layout.
      assert.match(source, /requireRole\(\[\.\.\.AGENCY_ROLES\]\)/, `${rel} must re-assert the role gate`);
      assert.match(source, /if \(!devDocsAccessible\(session\)\) notFound\(\)/, `${rel} must re-assert the founder gate`);
    }
  });
});
