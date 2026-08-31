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
let founderAgencyId: string;

const FOUNDER_EMAIL = "founder@auditor.smoke.test";

before(async () => {
  // In-memory backend — this suite must never touch the real portal state file.
  process.env.PORTAL_BACKEND = "memory";
  process.env.PORTAL_VAULT_ENCRYPTION_KEY = "auditor-smoke-vault-key-longer-than-thirty-two-characters";
  delete process.env.OPENAI_API_KEY; // the point is a vault connection, not an env key
  // The founder gate is resolved from real state: `mayUseEnvironmentCredentials`
  // answers false for EVERY agency while the founder account is unseeded. On an
  // unseeded deployment an assertion that some agency is NOT the founder's is
  // therefore vacuous — it would pass for the founder's own agency too. Seed a
  // real founder so both sides of the gate are distinguishable here, which is
  // what makes the "this is not the founder's agency" assertions below mean
  // something and lets the founder's own view be proven at all.
  process.env.FOUNDER_EMAIL = FOUNDER_EMAIL;
  auditor = await import("../src/lib/server/dev/devTeamAuditor");
  storage = await import("../src/server/storage");
  tenants = await import("../src/server/tenants");
  connections = await import("../src/lib/server/integrations/integrationConnections");
  await storage.ensureHydrated();
  await storage.reset();
  founderAgencyId = tenants.createAgency({ name: "Operator", slug: "operator-founder" }).id;
  storage.mutate(state => {
    state.users[FOUNDER_EMAIL] = {
      id: "user_founder_auditor_smoke",
      email: FOUNDER_EMAIL,
      agencyId: founderAgencyId,
      role: "agency-owner",
      name: "Auditor Smoke Founder",
      createdAt: 0,
      updatedAt: 0,
    } as never;
  });
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
    // The header includes unresolved rulings, open blockers, and required
    // readiness failures; its clear label appears only on the zero branch.
    assert.match(section, /const overallOpenCount = stillOpenCount \+ openBlockers\.length \+ requiredNotReady\.length/);
    assert.match(section, /overallOpenCount > 0 \? `\$\{overallOpenCount\} open` : "Source checks clear"/);
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

  // env-and-sellability.md §3. The context is what carries WHOSE readiness this
  // is, and where the email answer comes from. Before this the builder handed
  // over four counts and the verdict was decided by `process.env`: a company
  // that is not the operator's read "production setup is incomplete" forever,
  // and a company that had connected SMTP was told its customer email was not
  // connected at all — because readiness asked about `resend` and nothing else,
  // while `sendTransactionalEmail` had supported SMTP the whole time.
  it("judges a company on its own connections, SMTP included", async () => {
    const agency = tenants.createAgency({ name: "Buyer SMTP", slug: "buyer-smtp" });
    const smtp = connections.saveIntegrationConnection({
      agencyId: agency.id,
      provider: "smtp",
      label: "Their mail server",
      values: {
        host: "smtp.buyer.example",
        port: "587",
        username: "hello@buyer.example",
        password: "buyer-app-password",
        fromEmail: "hello@buyer.example",
        fromName: "Buyer Ltd",
      },
      actorUserId: "owner",
    });
    // Saving credential bytes never makes them live; only a deliberate
    // activation does, and readiness must follow the SAME rule the send path
    // does rather than counting a stored-but-inactive row.
    connections.activateIntegrationConnection({
      agencyId: agency.id,
      connectionId: smtp.id,
      actorUserId: "owner",
      allowUntested: true,
    });

    const context = auditor.readinessContextForAgency(agency.id);
    assert.equal(context.agencyId, agency.id);
    assert.equal(
      context.environmentCredentialsBelongToAgency,
      false,
      "the deployment's environment is the founder's, and this is not the founder's agency",
    );
    assert.equal(context.transactionalEmailConfigured, true, "SMTP is a sender readiness used to be blind to");
    assert.equal(
      context.enquiryNotificationsConfigured,
      false,
      "public enquiry alerts still go out through Resend, and nothing resolves a recipient",
    );

    const audit = await auditor.scanDevTeamAudit(context);
    assert.equal(audit.readiness.audience, "company");
    assert.equal(
      audit.readiness.items.some(item => item.scope === "platform"),
      false,
      "a tenant is not shown rows about the operator's database and session secret",
    );
    const email = audit.readiness.items.find(item => item.id === "email");
    assert.equal(email?.status, "needs-setup");
    assert.match(
      email?.summary ?? "",
      /enquiry has no inbox/i,
      "the remaining gap is the enquiry recipient — not the sender it already has",
    );
    // …and the action must name the thing that actually clears it. Public
    // enquiry alerts leave through Resend and nothing else, so telling an
    // SMTP-only workspace to "set a support email" would offer a remedy that
    // leaves the required row red — the house contract is that an action states
    // how it is dealt with.
    assert.match(
      email?.action ?? "",
      /Resend/,
      "an SMTP-only workspace must be told a Resend connection is what clears the enquiry half",
    );
  });

  // The other side of the gate, and the one the settings page now depends on:
  // the founder's own agency must still get the WHOLE deployment view. Without
  // a seeded founder every agency answers "not mine", so this pairing is what
  // proves the split is a real decision rather than a constant.
  it("still gives the operator's own agency the whole deployment view", async () => {
    const context = auditor.readinessContextForAgency(founderAgencyId);
    assert.equal(
      context.environmentCredentialsBelongToAgency,
      true,
      "the environment's credentials ARE the founder agency's configuration",
    );

    const audit = await auditor.scanDevTeamAudit(context);
    assert.equal(audit.readiness.audience, "platform");
    assert.ok(
      audit.readiness.items.some(item => item.id === "database" && item.scope === "platform"),
      "the operator keeps the rows only they can act on",
    );
    assert.ok(
      audit.readiness.items.some(item => item.envKeys.length > 0),
      "envKeys stay for the founder — they are the debugging aid only a redeploy can use",
    );
  });

  it("lets a company reach ready without a redeploy", async () => {
    const agency = tenants.createAgency({ name: "Buyer Resend", slug: "buyer-resend" });
    const resend = connections.saveIntegrationConnection({
      agencyId: agency.id,
      provider: "resend",
      label: "Their Resend",
      values: {
        apiKey: "re_buyer_key",
        fromEmail: "hello@buyer.example",
        fromName: "Buyer Ltd",
        notifyTo: "enquiries@buyer.example",
      },
      actorUserId: "owner",
    });
    connections.activateIntegrationConnection({
      agencyId: agency.id,
      connectionId: resend.id,
      actorUserId: "owner",
      allowUntested: true,
    });

    const context = auditor.readinessContextForAgency(agency.id);
    assert.equal(context.enquiryNotificationsConfigured, true);
    const audit = await auditor.scanDevTeamAudit(context);
    assert.equal(audit.readiness.items.find(item => item.id === "email")?.status, "ready");
    assert.equal(
      audit.readiness.ready,
      true,
      "the whole point of selling this: a buyer can finish setup from inside the app",
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
  it("the two founder-gate names are one decision, so a section may use either", async () => {
    // This is what makes the `dev(Docs|Team)Accessible` alternation above safe.
    const docs = await read("src/lib/server/dev/devDocs.ts");
    assert.match(
      docs,
      /export function devDocsAccessible\(session: SessionPayload \| null \| undefined\): boolean \{\s*\n\s*return devTeamAccessible\(session\);\s*\n\}/,
      "devDocsAccessible no longer simply delegates to devTeamAccessible — the section gate check above now permits two DIFFERENT decisions",
    );
  });

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
      // Either NAME, but provably one GATE. `devDocsAccessible` is now a
      // one-line delegation to `devTeamAccessible` — the single Dev Team access
      // decision — so a section calling the canonical name directly is the more
      // correct form, not a missing gate. Accepting both is only safe because
      // the delegation is asserted below; if they ever diverge, this loosening
      // stops being loose and starts being a hole.
      assert.match(
        source,
        /if \(!dev(?:Docs|Team)Accessible\(session\)\) notFound\(\)/,
        `${rel} must re-assert the founder gate`,
      );
    }
  });
});
