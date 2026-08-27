// Dev Docs smoke — the founder-only in-app docs browser and Dev Team gate.
//
// Behavioural, and hermetic by construction: the sidebar item is gated on an
// INJECTED `devTeamAvailable` flag (buildSidebar never reads env), so the
// visibility contract needs no env mutation at all. Local fixtures still use
// Dev Mode; production uses the deployment's one live FOUNDER_EMAIL account.
//
// Proves:
//   1. the "Dev Docs" nav item appears only when the authenticated caller
//      injects Dev Team access, and never leaks into client scope;
//   2. `devDocsAccessible()` accepts local founder fixtures in Dev Mode or the
//      one live production founder, never another agency owner;
//   3. the doc index reads live off disk: every dev *.md, newest-edited first,
//      categorised, with a known plan present;
//   4. `relativeAge` formats the last-edited stamp.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildSidebar, type BuildSidebarInput, type NavPanel } from "../src/lib/chrome/sidebarLayout";
import {
  devDocsAccessible,
  listDevDocs,
  readDevDoc,
  scanDevDocs,
  buildDocTree,
  parseBlockers,
  parseChecklistBlockers,
  scanBlockers,
} from "../src/lib/server/dev/devDocs";
import { relativeAge } from "../src/lib/shared/formatDateTime";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import { createUser } from "../src/server/users";
import type { SessionPayload } from "../src/server/types";

process.env.PORTAL_BACKEND ??= "memory";

// --- helpers ----------------------------------------------------------------

function sessionWithRole(role: SessionPayload["role"]): SessionPayload {
  return { role } as unknown as SessionPayload;
}

function agencyInput(over: Partial<BuildSidebarInput>): BuildSidebarInput {
  return {
    role: "agency-owner",
    scope: "agency",
    installedPlugins: [],
    isFounder: true,
    ...over,
  };
}

function findItem(panels: NavPanel[], id: string) {
  return panels.flatMap(p => p.items).find(i => i.id === id);
}

// Run fn with Dev Mode's env guards satisfied, then restore. Await fn() before
// restoring or the env pops back the moment the callback first suspends.
async function withDevModeEnabled<T>(fn: () => Promise<T>): Promise<T> {
  const saved = {
    dev: process.env.PORTAL_DEV_MODE,
    node: process.env.NODE_ENV,
    vercel: process.env.VERCEL_ENV,
  };
  process.env.PORTAL_DEV_MODE = "true";
  if (process.env.NODE_ENV === "production") process.env.NODE_ENV = "test";
  delete process.env.VERCEL_ENV;
  try {
    return await fn();
  } finally {
    restore("PORTAL_DEV_MODE", saved.dev);
    restore("NODE_ENV", saved.node);
    restore("VERCEL_ENV", saved.vercel);
  }
}

function restore(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

// --- 1. sidebar visibility (pure, no env) -----------------------------------

describe("Dev Docs — sidebar gate", () => {
  it("shows the item when the authenticated founder has Dev Team access", () => {
    const panels = buildSidebar(agencyInput({ isFounder: true, devTeamAvailable: true }));
    const item = findItem(panels, "dev-docs");
    assert.ok(item, "expected a dev-docs nav item");
    assert.equal(item?.href, "/portal/agency/dev-docs");
  });

  it("hides the item when Dev Team access is unavailable", () => {
    const panels = buildSidebar(agencyInput({ isFounder: true, devTeamAvailable: false }));
    assert.equal(findItem(panels, "dev-docs"), undefined);
  });

  it("hides the item for a non-founder even when access is mistakenly injected", () => {
    const panels = buildSidebar(agencyInput({ isFounder: false, devTeamAvailable: true }));
    assert.equal(findItem(panels, "dev-docs"), undefined);
  });

  it("does not confuse the demo-persona switch with Dev Team availability", () => {
    const panels = buildSidebar(agencyInput({ isFounder: true, devModeAvailable: true }));
    assert.equal(findItem(panels, "dev-docs"), undefined);
  });

  it("defaults off when the caller supplies no access decision", () => {
    const panels = buildSidebar(agencyInput({ isFounder: true }));
    assert.equal(findItem(panels, "dev-docs"), undefined);
  });

  it("never leaks into client scope", () => {
    const panels = buildSidebar({
      role: "client-owner",
      scope: "client",
      installedPlugins: [],
      isFounder: true,
      devTeamAvailable: true,
      currentClient: { id: "cl_1" } as never,
    });
    assert.equal(findItem(panels, "dev-docs"), undefined);
  });
});

// --- 2 + 3. access gate + live index ----------------------------------------

describe("Dev Docs — access gate", () => {
  it("refuses a non-founder regardless of Dev Mode", async () => {
    await withDevModeEnabled(async () => {
      assert.equal(devDocsAccessible(sessionWithRole("client-owner")), false);
      assert.equal(devDocsAccessible(sessionWithRole("agency-staff")), false);
      assert.equal(devDocsAccessible(null), false);
    });
  });

  it("refuses an arbitrary agency owner when Dev Mode is off", () => {
    assert.equal(devDocsAccessible(sessionWithRole("agency-owner")), false);
  });

  it("allows a local founder fixture when Dev Mode is on", async () => {
    await withDevModeEnabled(async () => {
      assert.equal(devDocsAccessible(sessionWithRole("agency-owner")), true);
    });
  });

  it("allows the configured live founder without Dev Mode and refuses another owner", async () => {
    await ensureHydrated();
    const savedFounderEmail = process.env.FOUNDER_EMAIL;
    const savedDevMode = process.env.PORTAL_DEV_MODE;
    const savedNodeEnv = process.env.NODE_ENV;
    const savedVercelEnv = process.env.VERCEL_ENV;
    const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const email = `production-founder-${unique}@example.test`;
    const agency = createAgency({ name: `Production founder ${unique}`, slug: `production-founder-${unique}` });
    const user = createUser({
      email,
      name: "Production Founder",
      role: "agency-owner",
      agencyId: agency.id,
      password: "production-founder-test-pass",
    });
    const session = {
      userId: user.id,
      email: user.email,
      role: user.role,
      agencyId: agency.id,
      agencyIds: [agency.id],
      activeAgencyId: agency.id,
      sessionRev: user.sessionRev ?? 0,
    } as SessionPayload;

    process.env.FOUNDER_EMAIL = email;
    delete process.env.PORTAL_DEV_MODE;
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    try {
      assert.equal(devDocsAccessible(session), true);
      assert.equal(devDocsAccessible({ ...session, email: `other-${email}` }), false);
    } finally {
      restore("FOUNDER_EMAIL", savedFounderEmail);
      restore("PORTAL_DEV_MODE", savedDevMode);
      restore("NODE_ENV", savedNodeEnv);
      restore("VERCEL_ENV", savedVercelEnv);
    }
  });

  it("listDevDocs throws for a non-founder even in Dev Mode", async () => {
    await withDevModeEnabled(async () => {
      await assert.rejects(() => listDevDocs(sessionWithRole("client-owner")));
    });
  });
});

describe("Dev Docs — production packaging", () => {
  it("traces only runtime docs into production routes and leaves dev edits out of the compiler graph", () => {
    const source = readFileSync("next.config.ts", "utf8");
    assert.match(source, /const DEV_TEAM_RUNTIME_FILES = \[/);
    assert.match(source, /"\.\/docs\/\*\*\/\*"/);
    assert.match(source, /"\.\/scripts\/\*\*\/\*\.md"/);
    assert.match(source, /"\.\/src\/\*\*\/\*\.md"/);
    assert.doesNotMatch(source, /"\.\/scripts\/\*\*\/\*"/);
    assert.doesNotMatch(source, /"\.\/src\/\*\*\/\*"/);
    assert.match(source, /process\.env\.NODE_ENV === "production"/);
    assert.match(source, /outputFileTracingIncludes: DEV_TEAM_OUTPUT_TRACING/);
    assert.match(source, /"\/portal\/dev-team\/\*\*": DEV_TEAM_RUNTIME_FILES/);
    assert.match(source, /"\/portal\/agency\/dev-docs": DEV_TEAM_RUNTIME_FILES/);
    assert.match(source, /"\/api\/portal\/dev-team\/\*\*": DEV_TEAM_RUNTIME_FILES/);
    assert.match(source, /"\/api\/portal\/dev\/\*\*": DEV_TEAM_RUNTIME_FILES/);
    assert.doesNotMatch(source, /DEV_TEAM_RUNTIME_FILES\s*=\s*\[\s*"\.\/\*\*\/\*"/);
  });
});

describe("Dev Docs — live index", () => {
  it("scans every project *.md off disk, newest-edited first, into a folder tree", async () => {
    const index = await scanDevDocs();

    // Everything (Ed's call), including the consolidated generated references.
    assert.ok(index.total > 100, `expected a large index, got ${index.total}`);

    // Sorted strictly non-increasing by mtime.
    for (let i = 1; i < index.entries.length; i++) {
      assert.ok(
        index.entries[i - 1].mtimeMs >= index.entries[i].mtimeMs,
        "entries must be newest-edited first",
      );
    }

    // Paths are project-root-relative. The authored docs remain present while
    // reference detail lives in a handful of large volumes, not 2,000 stubs.
    const docsNode = index.tree.find(n => n.isDir && n.name === "docs");
    assert.ok(docsNode && docsNode.count > 100, "docs/ folder present and substantial");
    const ref = docsNode.children!.find(n => n.isDir && n.name === "reference");
    assert.ok(ref && ref.count >= 10 && ref.count <= 12, "docs/reference/ is consolidated");

    // Known docs indexed at their real (project-relative) paths, with real titles.
    const plan = index.entries.find(e => e.relPath === "docs/development/plans/dev-docs.md");
    assert.ok(plan, "the Dev Docs plan itself should be indexed");
    assert.ok((plan?.title.length ?? 0) > 0, "title from the first heading");
    assert.ok((plan?.mtimeMs ?? 0) > 0, "a last-edited stamp");
    assert.ok(index.entries.some(e => e.relPath === "docs/development.md"), "the catalogue is indexed");

    // Ed: all docs — the root handoff files are now in, vendor dirs are not.
    assert.ok(index.entries.some(e => e.relPath === "CLAUDE.md"), "root CLAUDE.md included");
    assert.ok(!index.entries.some(e => e.relPath.startsWith("node_modules/")), "node_modules excluded");
  });

  it("builds a folder tree: folders aggregate counts + newest, folders sort before files", () => {
    const entries = [
      { relPath: "docs/a/one.md", title: "one", mtimeMs: 10, sizeBytes: 1 },
      { relPath: "docs/a/two.md", title: "two", mtimeMs: 30, sizeBytes: 1 },
      { relPath: "docs/b/deep/three.md", title: "three", mtimeMs: 20, sizeBytes: 1 },
      { relPath: "top.md", title: "top", mtimeMs: 5, sizeBytes: 1 },
    ];
    const tree = buildDocTree(entries);

    assert.equal(tree[0].isDir, true, "a folder sorts before the loose top-level file");
    const docs = tree.find(n => n.name === "docs");
    assert.ok(docs?.isDir);
    assert.equal(docs?.count, 3, "docs/ aggregates its 3 files");
    assert.equal(docs?.newestMtimeMs, 30, "docs/ newest = its newest child");
    const a = docs!.children!.find(n => n.name === "a");
    assert.equal(a?.count, 2, "docs/a aggregates 2");
    const b = docs!.children!.find(n => n.name === "b");
    assert.equal(b?.children![0].name, "deep", "nested folder preserved");
  });
});

// --- 3b. viewer reader: gate + path safety + live read ----------------------

describe("Dev Docs — readDevDoc", () => {
  it("refuses a non-founder even in Dev Mode", async () => {
    await withDevModeEnabled(async () => {
      await assert.rejects(() => readDevDoc(sessionWithRole("client-owner"), "docs/development.md"));
    });
  });

  it("refuses an arbitrary owner when local Dev Mode is off", async () => {
    await assert.rejects(() => readDevDoc(sessionWithRole("agency-owner"), "docs/development.md"));
  });

  it("reads a known doc's live markdown for a founder in Dev Mode", async () => {
    await withDevModeEnabled(async () => {
      const doc = await readDevDoc(sessionWithRole("agency-owner"), "docs/development/plans/dev-docs.md");
      assert.equal(doc.relPath, "docs/development/plans/dev-docs.md");
      assert.ok(doc.title.length > 0, "a title from the heading");
      assert.ok(doc.content.includes("Dev Docs"), "the live file content");
      assert.ok(doc.mtimeMs > 0, "a last-edited stamp");
    });
  });

  it("now reaches the root handoff files (Ed: all docs)", async () => {
    await withDevModeEnabled(async () => {
      const doc = await readDevDoc(sessionWithRole("agency-owner"), "CLAUDE.md");
      assert.equal(doc.relPath, "CLAUDE.md");
      assert.ok(doc.content.length > 0, "the live root file");
    });
  });

  it("confines to the project root — rejects path traversal", async () => {
    await withDevModeEnabled(async () => {
      await assert.rejects(() => readDevDoc(sessionWithRole("agency-owner"), "../package.json"));
      await assert.rejects(() => readDevDoc(sessionWithRole("agency-owner"), "../../etc/hosts"));
    });
  });

  it("rejects a non-markdown path, a directory, a missing file, and vendor dirs", async () => {
    await withDevModeEnabled(async () => {
      await assert.rejects(() => readDevDoc(sessionWithRole("agency-owner"), "package.json")); // inside root, not .md
      await assert.rejects(() => readDevDoc(sessionWithRole("agency-owner"), "docs/development/plans")); // a dir
      await assert.rejects(() => readDevDoc(sessionWithRole("agency-owner"), "docs/does-not-exist.md")); // missing
      await assert.rejects(() => readDevDoc(sessionWithRole("agency-owner"), "node_modules/next/README.md")); // vendor
    });
  });
});

// --- 3c. overview blockers (parsed from current status docs) ----------------

describe("Dev Docs — blockers", () => {
  it("parses only the Blockers section: open vs resolved, detail split", () => {
    const md = [
      "# State",
      "## Workers in flight",
      "- not a blocker at all",
      "## Blockers",
      "- ~~**Runtime verification**~~ ✅ **CLEARED** — a server runs now",
      "- **RLS** — needs Ed + the Supabase dashboard",
      "- **First git commit** — months uncommitted; Ed's call",
      "## Decisions Ed owes",
      "- also not a blocker",
    ].join("\n");

    const b = parseBlockers(md);
    assert.equal(b.length, 3, "only the three items under ## Blockers");

    const open = b.filter(x => !x.resolved).map(x => x.label);
    assert.ok(open.includes("RLS"), "RLS is an open blocker");
    assert.ok(open.includes("First git commit"), "First git commit is open");
    assert.equal(b.filter(x => x.resolved).length, 1, "the CLEARED one is resolved");
    assert.ok(b.every(x => x.label.length > 0), "every item has a label");

    const rls = b.find(x => x.label === "RLS");
    assert.equal(rls?.detail, "needs Ed + the Supabase dashboard", "detail split on the em-dash");
  });

  it("a 'done' inside an open blocker's detail does not flip it to resolved", () => {
    const md = ["## Blockers", "- **Thing** — this is not done yet"].join("\n");
    const [only] = parseBlockers(md);
    assert.equal(only.resolved, false);
  });

  it("parses open and closed checkbox items only from red checklist sections", () => {
    const md = [
      "## 🔴 Open defects",
      "- [ ] **Finance role leak:** staff can read salaries",
      "      through the SSR page.",
      "- [x] **MFA:** implemented and verified.",
      "## 🟠 Later work",
      "- [ ] **Not a blocker:** this must stay out",
    ].join("\n");

    const blockers = parseChecklistBlockers(md);
    assert.deepEqual(blockers.map(blocker => blocker.label), ["Finance role leak:", "MFA:"]);
    assert.equal(blockers[0]?.resolved, false);
    assert.match(blockers[0]?.detail ?? "", /through the SSR page/);
    assert.equal(blockers[1]?.resolved, true);
  });

  it("scanBlockers reads the live status docs and returns well-formed items", async () => {
    const b = await scanBlockers();
    assert.ok(Array.isArray(b));
    for (const x of b) {
      assert.equal(typeof x.label, "string");
      assert.equal(typeof x.resolved, "boolean");
    }
  });

  it("the Auditor cannot call partial source evidence an all-clear launch verdict", () => {
    const source = readFileSync("src/app/portal/dev-team/auditor/_Section.tsx", "utf8");
    assert.match(source, /overallOpenCount = stillOpenCount \+ openBlockers\.length \+ requiredNotReady\.length/);
    assert.match(source, /Source checks clear/);
    assert.match(source, /Source readiness does not replace a current browser, authorisation, tenant-isolation, crash, public-flow and performance audit/);
    assert.doesNotMatch(source, /nothing standing between us and launch/i);
  });
});

// --- 4. last-edited stamp ---------------------------------------------------

describe("Dev Docs — relativeAge", () => {
  const now = 1_700_000_000_000;
  it("formats recent → distant", () => {
    assert.equal(relativeAge(now, now), "just now");
    assert.equal(relativeAge(now - 30_000, now), "just now");
    assert.equal(relativeAge(now - 3 * 60_000, now), "3m ago");
    assert.equal(relativeAge(now - 5 * 3_600_000, now), "5h ago");
    assert.equal(relativeAge(now - 2 * 86_400_000, now), "2d ago");
    assert.equal(relativeAge(now - 45 * 86_400_000, now), "1mo ago");
    assert.equal(relativeAge(now - 400 * 86_400_000, now), "1y ago");
  });
  it("never returns a negative age for a future stamp", () => {
    assert.equal(relativeAge(now + 10_000, now), "just now");
  });
});
