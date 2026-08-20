// Dev Docs smoke — the owner + Dev-Mode-only in-app docs browser (Phase 1).
//
// Behavioural, and hermetic by construction: the sidebar item is gated on an
// INJECTED `devModeAvailable` flag (buildSidebar never reads env), so the
// visibility contract needs no env mutation at all. Only the positive gate
// path (`canUseDevMode()` true) briefly satisfies the Dev Mode env guards via
// the same restore-in-finally shape as smoke-dev-mode.test.ts.
//
// Proves:
//   1. the "Dev Docs" nav item appears ONLY for a founder in Dev Mode, and is
//      absent for a normal owner, a non-founder, in production-like env, and in
//      client scope — the #1 safety contract;
//   2. `devDocsAccessible()` combines Dev Mode AND founder (both required);
//   3. the doc index reads live off disk: every dev *.md, newest-edited first,
//      categorised, with a known plan present;
//   4. `relativeAge` formats the last-edited stamp.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildSidebar, type BuildSidebarInput, type NavPanel } from "../src/lib/chrome/sidebarLayout";
import {
  devDocsAccessible,
  listDevDocs,
  readDevDoc,
  scanDevDocs,
  buildDocTree,
  parseBlockers,
  scanBlockers,
} from "../src/lib/server/dev/devDocs";
import { relativeAge } from "../src/lib/shared/formatDateTime";
import { ensureHydrated } from "../src/server/storage";
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
  it("shows the item for a founder with Dev Mode available", () => {
    const panels = buildSidebar(agencyInput({ isFounder: true, devModeAvailable: true }));
    const item = findItem(panels, "dev-docs");
    assert.ok(item, "expected a dev-docs nav item");
    assert.equal(item?.href, "/portal/agency/dev-docs");
  });

  it("hides the item when Dev Mode is unavailable (the production-like case)", () => {
    const panels = buildSidebar(agencyInput({ isFounder: true, devModeAvailable: false }));
    assert.equal(findItem(panels, "dev-docs"), undefined);
  });

  it("hides the item for a non-founder even with Dev Mode available", () => {
    const panels = buildSidebar(agencyInput({ isFounder: false, devModeAvailable: true }));
    assert.equal(findItem(panels, "dev-docs"), undefined);
  });

  it("defaults off — a normal owner build (no flag) never sees it", () => {
    const panels = buildSidebar(agencyInput({ isFounder: true }));
    assert.equal(findItem(panels, "dev-docs"), undefined);
  });

  it("never leaks into client scope", () => {
    const panels = buildSidebar({
      role: "client-owner",
      scope: "client",
      installedPlugins: [],
      isFounder: true,
      devModeAvailable: true,
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

  it("refuses a founder when Dev Mode is off (default env)", () => {
    // No env mutation: PORTAL_DEV_MODE is unset in the suite, so canUseDevMode() is false.
    assert.equal(devDocsAccessible(sessionWithRole("agency-owner")), false);
  });

  it("allows a founder only when Dev Mode is on", async () => {
    await withDevModeEnabled(async () => {
      assert.equal(devDocsAccessible(sessionWithRole("agency-owner")), true);
    });
  });

  it("listDevDocs throws for a non-founder even in Dev Mode", async () => {
    await withDevModeEnabled(async () => {
      await assert.rejects(() => listDevDocs(sessionWithRole("client-owner")));
    });
  });
});

describe("Dev Docs — live index", () => {
  it("scans every project *.md off disk, newest-edited first, into a folder tree", async () => {
    const index = await scanDevDocs();

    // Everything (Ed's call): the generated reference/ tree makes this large.
    assert.ok(index.total > 100, `expected a large index, got ${index.total}`);

    // Sorted strictly non-increasing by mtime.
    for (let i = 1; i < index.entries.length; i++) {
      assert.ok(
        index.entries[i - 1].mtimeMs >= index.entries[i].mtimeMs,
        "entries must be newest-edited first",
      );
    }

    // Paths are project-root-relative; the docs/ folder dominates the tree.
    const docsNode = index.tree.find(n => n.isDir && n.name === "docs");
    assert.ok(docsNode && docsNode.count > 500, "docs/ folder present and large");
    const ref = docsNode.children!.find(n => n.isDir && n.name === "reference");
    assert.ok(ref && ref.count > 500, "docs/reference/ dominates");

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

  it("refuses a founder when Dev Mode is off", async () => {
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

// --- 3c. overview blockers (parsed from state.md) ---------------------------

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

  it("scanBlockers reads live state.md and returns well-formed items", async () => {
    const b = await scanBlockers();
    assert.ok(Array.isArray(b));
    for (const x of b) {
      assert.equal(typeof x.label, "string");
      assert.equal(typeof x.resolved, "boolean");
    }
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
