// FILE FINDING — the skill, built once, callable by any assistant.
//
// Ed (dev-editor-finish.md, phase 15): "the librarian … is for files finding
// make it a skill they can all use as well". This pins the skill itself —
// `src/lib/server/dev/fileFinding.ts` — NOT any one consumer of it. The
// Librarian and the Aqua Editor AI mount it later; if their needs diverge, the
// divergence belongs in the consumer, and these contracts hold.
//
// The five properties the plan names, each from both sides:
//
//   1. RANKED — a file NAMED like the query beats a symbol named like it,
//      which beats a doc titled like it, which beats a passing mention; and a
//      hit answering MORE of the query's terms beats them all.
//   2. CAPPED — `limit` is honoured and the cap is confessed, never silent.
//   3. TENANT-ISOLATED — another agency's project id throws the same
//      `project_not_found` a made-up id does. No repo, no oracle.
//   4. DEGRADES, honestly — no repo map → docs + reference still answer, and
//      `searched.repo.status` says so.
//   5. NO NETWORK WITHOUT A TOKEN — a GitHub-mapped project with no resolvable
//      token searches only the recorded map. Asserted with a tripwired
//      readTree AND a tripwired global fetch.

process.env.PORTAL_BACKEND ??= "memory";
process.env.PORTAL_STORAGE_BACKEND ??= "memory";
// No test here ever wants the environment's real token ladder to answer.
delete process.env.GITHUB_TOKEN;

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fileFindingBrief,
  findFiles,
  parseReferencePage,
  queryTerms,
  type FileFindingDeps,
  type FileFindingHit,
  type FileFindingResult,
} from "../src/lib/server/dev/fileFinding";
import { recordDevProjectMap, saveDevProject } from "../src/engines/editor/server/devProjects";
import { ensureHydrated } from "../src/server/storage";
import { createAgency } from "../src/server/tenants";
import type { DevDocsIndex, DevDocEntry } from "../src/lib/server/dev/devDocs";
import type { DevProject, DevProjectRepoMap } from "../src/server/types";

let seq = 0;

function agency(name = "Finding Co") {
  seq += 1;
  return createAgency({ name, slug: `file-finding-${Date.now()}-${seq}` });
}

function project(agencyId: string, overrides: { name?: string; repository?: string } = {}): DevProject {
  return saveDevProject({
    agencyId,
    name: overrides.name ?? "Finding project",
    repository: overrides.repository,
    actorUserId: "user_finder",
  });
}

function mapProjectRepo(agencyId: string, projectId: string, repo: Partial<DevProjectRepoMap> & Pick<DevProjectRepoMap, "source">): void {
  const now = Date.now();
  recordDevProjectMap({
    agencyId,
    id: projectId,
    actorUserId: "user_finder",
    map: {
      repo: {
        repository: "",
        ref: "main",
        fileCount: 0,
        mappableCount: 0,
        directories: [],
        truncated: false,
        mappedAt: now,
        ...repo,
      },
      lastMappedAt: now,
      lastMappedBy: "user_finder",
    },
  });
}

function docsIndex(entries: Array<Pick<DevDocEntry, "relPath" | "title">>): DevDocsIndex {
  const full = entries.map((entry, i) => ({ ...entry, mtimeMs: 1000 + i, sizeBytes: 100 }));
  return { entries: full, tree: [], total: full.length, scannedAtMs: Date.now() };
}

const NO_DOCS = () => Promise.resolve(docsIndex([]));

/** A reference dir the parser can read, holding exactly the fixture pages given. */
async function referenceFixture(pages: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aqua-file-finding-ref-"));
  await Promise.all(Object.entries(pages).map(([name, content]) => writeFile(join(dir, name), content)));
  return dir;
}

/** An empty reference dir — for tests that want docs/repo behaviour alone. */
let emptyReferenceDir: string;

/** Seams that make any accidental source read loud instead of slow. */
function isolatedDeps(overrides: FileFindingDeps = {}): FileFindingDeps {
  return {
    scanDocs: NO_DOCS,
    referenceDir: emptyReferenceDir,
    readTree: async () => { throw new Error("readTree must not be called by this test"); },
    readWorkspace: async () => { throw new Error("readWorkspace must not be called by this test"); },
    ...overrides,
  };
}

const hitPaths = (result: FileFindingResult) => result.hits.map(hit => hit.path);
const reasonKinds = (hit: FileFindingHit) => hit.reasons.map(reason => reason.kind);

before(async () => {
  await ensureHydrated();
  emptyReferenceDir = await mkdtemp(join(tmpdir(), "aqua-file-finding-empty-"));
});

// ─────────────────────────────────────────────────────────────────────────────

describe("File finding — ranking, with the why said out loud", () => {
  const FIXTURE_REFERENCE = {
    "lib.md": [
      "### `src/lib/payments/session.ts`",
      "",
      "- `createCheckoutSession(input: CheckoutInput): Session` — builds the checkout session",
      "",
      "### `src/lib/tax/vat.ts`",
      "",
      "- `vatRate(country: string): number` — used by checkout totals",
      "",
    ].join("\n"),
  };

  const FIXTURE_DOCS = () => Promise.resolve(docsIndex([
    { relPath: "docs/plans/checkout-flow.md", title: "Checkout flow" },
    { relPath: "docs/plans/unrelated.md", title: "Radar catalogue" },
  ]));

  async function checkoutWorld(query: string, limit?: number) {
    const { id: agencyId } = agency();
    const proj = project(agencyId);
    mapProjectRepo(agencyId, proj.id, { source: "workspace", fileCount: 2, mappableCount: 1 });
    return findFiles({ agencyId, projectId: proj.id, query, limit }, isolatedDeps({
      readWorkspace: async () => [
        { path: "src/checkout/CheckoutPage.tsx", size: 10 },
        { path: "src/lib/money.ts", size: 10 },
      ],
      scanDocs: FIXTURE_DOCS,
      referenceDir: await referenceFixture(FIXTURE_REFERENCE),
    }));
  }

  it("ranks name hits over symbol hits over doc titles over passing mentions", async () => {
    const result = await checkoutWorld("checkout");

    assert.deepEqual(hitPaths(result), [
      "src/checkout/CheckoutPage.tsx",   // basename hit — the file IS the thing
      "src/lib/payments/session.ts",     // a symbol NAMED checkout
      "docs/plans/checkout-flow.md",     // a doc titled it
      "src/lib/tax/vat.ts",              // a passing mention in a summary
    ]);
    assert.ok(!hitPaths(result).includes("src/lib/money.ts"), "an unmatched file is not a hit");
    assert.ok(!hitPaths(result).includes("docs/plans/unrelated.md"), "an unmatched doc is not a hit");
  });

  it("says WHY each hit matched, with the kind the plan names", async () => {
    const result = await checkoutWorld("checkout");
    const [page, symbol, doc, mention] = result.hits;

    assert.deepEqual(reasonKinds(page), ["path"]);
    assert.equal(page.reasons[0].detail, "CheckoutPage.tsx");
    assert.ok(reasonKinds(symbol).includes("symbol"), "the session file matched on its symbol");
    assert.equal(symbol.reasons.find(r => r.kind === "symbol")?.detail, "createCheckoutSession");
    assert.deepEqual(reasonKinds(doc), ["doc-title"]);
    assert.equal(doc.title, "Checkout flow");
    assert.deepEqual(reasonKinds(mention), ["content"], "vat.ts only ever MENTIONS checkout");
  });

  it("ranks a hit answering more of the query's terms above any single-term hit", async () => {
    const result = await checkoutWorld("checkout session");
    // `createCheckoutSession` carries both words; CheckoutPage.tsx only one.
    assert.equal(result.hits[0].path, "src/lib/payments/session.ts");
    assert.equal(result.hits[0].termsMatched, 2);
    assert.equal(result.hits[1].path, "src/checkout/CheckoutPage.tsx");
    assert.equal(result.hits[1].termsMatched, 1);
  });

  it("renders one deterministic plain-text brief any assistant can drop into context", async () => {
    const brief = fileFindingBrief(await checkoutWorld("checkout"));
    assert.match(brief, /^FILE FINDING — "checkout" — 4 hits/);
    assert.match(brief, /1\. src\/checkout\/CheckoutPage\.tsx \[repo\] — path: CheckoutPage\.tsx/);
    assert.match(brief, /symbol: createCheckoutSession/);
    assert.match(brief, /docs\/plans\/checkout-flow\.md \[docs\] — Checkout flow — doc-title: Checkout flow/);
  });

  it("caps at the limit and confesses the cap", async () => {
    const { id: agencyId } = agency();
    const proj = project(agencyId);
    mapProjectRepo(agencyId, proj.id, { source: "workspace" });
    const result = await findFiles({ agencyId, projectId: proj.id, query: "checkout", limit: 5 }, isolatedDeps({
      readWorkspace: async () => Array.from({ length: 30 }, (_, i) => ({ path: `src/checkout/step-${i}.tsx`, size: 1 })),
    }));

    assert.equal(result.hits.length, 5);
    assert.equal(result.capped, true);
    assert.equal(result.limit, 5);
    assert.match(fileFindingBrief(result), /capped at 5/);
  });

  it("clamps a silly limit instead of honouring it", async () => {
    const { id: agencyId } = agency();
    const result = await findFiles({ agencyId, query: "anything", limit: 5000 }, isolatedDeps());
    assert.equal(result.limit, 50);
  });

  it("refuses an empty query as a typed reason, not an empty success", async () => {
    const { id: agencyId } = agency();
    const result = await findFiles({ agencyId, query: "  a  " }, isolatedDeps());
    assert.equal(result.reason, "empty-query");
    assert.deepEqual(result.hits, []);
    assert.equal(result.capped, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("File finding — the verify pass's own reproductions, pinned", () => {
  // The adversarial verifier asked the lens's canonical question — "where does
  // publish live" — of a world where reference prose contains "lives" and
  // "delivery", and publish.ts ranked SEVENTH: substring content matches on
  // question filler outran the basename that answers the question. These pin
  // the three fixes: word-boundary content matching, content-only matches
  // never outranking real signals, and the exact-basename bonus.
  const NOISY_REFERENCE = {
    "app.md": [
      "### `src/engines/editor/editing/engine.ts`",
      "",
      "- `startEngine(): void` — where the editing loop lives, handles delivery of patches and publish flows",
      "",
      "### `src/lib/delivery/schedule.ts`",
      "",
      "- `nextDelivery(): Date` — delivery windows, lives beside the publish notes",
      "",
    ].join("\n"),
  };

  async function publishWorld(query: string, limit?: number) {
    const { id: agencyId } = agency();
    const proj = project(agencyId);
    mapProjectRepo(agencyId, proj.id, { source: "workspace", fileCount: 3, mappableCount: 3 });
    return findFiles({ agencyId, projectId: proj.id, query, limit }, isolatedDeps({
      readWorkspace: async () => [
        { path: "src/engines/editor/server/publish.ts", size: 10 },
        { path: "src/components/PublishBar.tsx", size: 10 },
        { path: "docs/publishing-checklist.md", size: 10 },
      ],
      scanDocs: () => Promise.resolve(docsIndex([])),
      reference: NOISY_REFERENCE,
    }));
  }

  it("'where does publish live' puts publish.ts FIRST, not seventh", async () => {
    const result = await publishWorld("where does publish live");
    assert.equal(result.hits[0]?.path, "src/engines/editor/server/publish.ts",
      "the file whose NAME answers the question outranks prose that grazed 'lives'/'delivery'");
  });

  it("content mentions of question filler do not outrank a basename hit", async () => {
    const result = await publishWorld("where does publish live");
    const prose = result.hits.findIndex(hit => hit.path === "src/lib/delivery/schedule.ts");
    const named = result.hits.findIndex(hit => hit.path === "src/engines/editor/server/publish.ts");
    assert.ok(named !== -1, "publish.ts is found");
    assert.ok(prose === -1 || named < prose, "prose-only hits rank below the named file");
  });

  it("the exact name beats a prefix: publish.ts above publishing-checklist.md", async () => {
    const result = await publishWorld("publish");
    const exact = result.hits.findIndex(hit => hit.path.endsWith("/publish.ts"));
    const prefix = result.hits.findIndex(hit => hit.path.endsWith("publishing-checklist.md"));
    assert.ok(exact !== -1 && prefix !== -1, "both are found");
    assert.ok(exact < prefix, "publish.ts IS the term; the checklist merely starts with it");
  });

  it("limit: NaN answers with the default, never with silent emptiness", async () => {
    const result = await publishWorld("publish", Number.NaN);
    assert.ok(result.hits.length > 0, "NaN cannot poison the clamp into slice(0, NaN)");
  });

  it("a term that is regex syntax refuses to crash the matcher", async () => {
    const result = await publishWorld("c++");
    assert.ok(Array.isArray(result.hits), "hostile terms are escaped, not thrown");
  });
});

describe("File finding — tenant first, then project, the devProjects order", () => {
  it("throws project_not_found for another agency's project — and identically for a made-up id", async () => {
    const owner = agency("Owner Co");
    const intruder = agency("Intruder Co");
    const proj = project(owner.id);
    mapProjectRepo(owner.id, proj.id, { source: "workspace", directories: ["src"] });

    // The real project id, asked for by the wrong agency: NOTHING — not a
    // docs-only degrade, not an empty success. The same error a guessed id
    // gets, so the refusal confirms nothing about what exists.
    await assert.rejects(
      findFiles({ agencyId: intruder.id, projectId: proj.id, query: "src" }, isolatedDeps()),
      /project_not_found/,
    );
    await assert.rejects(
      findFiles({ agencyId: intruder.id, projectId: "devproj_does_not_exist", query: "src" }, isolatedDeps()),
      /project_not_found/,
    );
  });

  it("refuses the foreign project even when the query is empty — tenant check first", async () => {
    const owner = agency("Owner Co");
    const intruder = agency("Intruder Co");
    const proj = project(owner.id);
    await assert.rejects(
      findFiles({ agencyId: intruder.id, projectId: proj.id, query: "" }, isolatedDeps()),
      /project_not_found/,
    );
  });

  it("still answers from docs and reference for the intruder's OWN scope — the refusal is the project's, not the agency's", async () => {
    const intruder = agency("Intruder Co");
    const result = await findFiles({ agencyId: intruder.id, query: "checkout" }, isolatedDeps({
      scanDocs: () => Promise.resolve(docsIndex([{ relPath: "docs/checkout.md", title: "Checkout" }])),
    }));
    assert.equal(result.hits.length, 1);
    assert.equal(result.searched.repo.status, "none");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("File finding — degrades honestly, never silently", () => {
  it("answers docs-only for a project with no repo map, and says so", async () => {
    const { id: agencyId } = agency();
    const proj = project(agencyId); // never mapped
    let treeCalls = 0;

    const result = await findFiles({ agencyId, projectId: proj.id, query: "checkout" }, isolatedDeps({
      readTree: async () => { treeCalls += 1; return { sha: "x", truncated: false, files: [] }; },
      scanDocs: () => Promise.resolve(docsIndex([{ relPath: "docs/checkout.md", title: "Checkout" }])),
    }));

    assert.equal(treeCalls, 0, "no repo map means nothing to read");
    assert.equal(result.searched.repo.status, "none");
    assert.match(result.searched.repo.detail, /no repository map yet/);
    assert.deepEqual(hitPaths(result), ["docs/checkout.md"], "docs still answer");
  });

  it("reports a docs scan failure instead of pretending docs were searched", async () => {
    const { id: agencyId } = agency();
    const result = await findFiles({ agencyId, query: "checkout" }, isolatedDeps({
      scanDocs: () => Promise.reject(new Error("disk detached")),
    }));
    assert.equal(result.searched.docs.searched, false);
    assert.match(result.searched.docs.detail ?? "", /disk detached/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("File finding — the network rule", () => {
  it("never fetches when no token resolves: the recorded map's directories answer instead", async () => {
    const { id: agencyId } = agency();
    const proj = project(agencyId, { repository: "acme/site" });
    mapProjectRepo(agencyId, proj.id, {
      source: "github",
      repository: "acme/site",
      directories: ["src", "checkout", "docs"],
      fileCount: 214,
      mappableCount: 40,
    });

    let treeCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error("the file-finding skill touched the network with no token"); }) as typeof fetch;
    try {
      const result = await findFiles({ agencyId, projectId: proj.id, query: "checkout" }, isolatedDeps({
        readTree: async () => { treeCalls += 1; return { sha: "x", truncated: false, files: [] }; },
      }));

      assert.equal(treeCalls, 0, "readTree must not run without a token");
      assert.equal(result.searched.repo.status, "map-only");
      assert.match(result.searched.repo.detail, /No GitHub token resolves/);
      const mapHit = result.hits.find(hit => hit.source === "repo");
      assert.equal(mapHit?.path, "checkout");
      assert.match(mapHit?.reasons[0].detail ?? "", /top-level directory recorded by the last Map/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reads the full tree through the engine's own readRepoTree when a token does resolve", async () => {
    const { id: agencyId } = agency();
    const proj = project(agencyId, { repository: "acme/site" });
    mapProjectRepo(agencyId, proj.id, { source: "github", repository: "acme/site", directories: ["src"] });

    const treeRequests: Array<{ repository: string; ref: string }> = [];
    const result = await findFiles({ agencyId, projectId: proj.id, query: "checkout" }, isolatedDeps({
      githubToken: "gh-test-token-not-real",
      readTree: async source => {
        treeRequests.push({ repository: source.repository, ref: source.ref });
        return { sha: "abc123", truncated: false, files: [{ path: "app/checkout/page.tsx", size: 5 }, { path: "app/home.tsx", size: 5 }] };
      },
    }));

    assert.deepEqual(treeRequests, [{ repository: "acme/site", ref: "main" }]);
    assert.equal(result.searched.repo.status, "full-tree");
    assert.deepEqual(hitPaths(result), ["app/checkout/page.tsx"]);
  });

  it("degrades to the recorded map when GitHub refuses, and names the failure", async () => {
    const { id: agencyId } = agency();
    const proj = project(agencyId, { repository: "acme/site" });
    mapProjectRepo(agencyId, proj.id, { source: "github", repository: "acme/site", directories: ["checkout"] });

    const result = await findFiles({ agencyId, projectId: proj.id, query: "checkout" }, isolatedDeps({
      githubToken: "gh-test-token-not-real",
      readTree: async () => { throw new Error("GitHub request failed (401)."); },
    }));

    assert.equal(result.searched.repo.status, "map-only");
    assert.match(result.searched.repo.detail, /GitHub request failed \(401\)/);
    assert.equal(result.hits.find(hit => hit.source === "repo")?.path, "checkout");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("File finding — the real generated reference answers", () => {
  it("locates findWordsInProject in the real docs/reference by symbol", async () => {
    const { id: agencyId } = agency();
    // Docs walk seamed off (its own scan is pinned by smoke-dev-docs); the
    // reference read here is the REAL generated pages.
    const result = await findFiles({ agencyId, query: "findWordsInProject" }, {
      scanDocs: NO_DOCS,
      readTree: async () => { throw new Error("no project given — readTree must not run"); },
    });

    assert.ok(result.searched.reference.searched, "the generated reference was read");
    const hit = result.hits.find(h => h.path === "src/engines/editor/server/sourceEdit.ts");
    assert.ok(hit, `sourceEdit.ts should be found, got: ${hitPaths(result).join(", ")}`);
    assert.ok(reasonKinds(hit).includes("symbol"), "matched on the symbol itself");
    assert.equal(hit.reasons.find(r => r.kind === "symbol")?.detail, "findWordsInProject");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("File finding — the parsers hold their corners", () => {
  it("parses bucket pages, files-index rows, and shrugs at anything else", () => {
    const entries = parseReferencePage([
      "# Symbol reference — whatever",
      "",
      "### `src/server/activity.ts`",
      "",
      "- `logActivity(input: LogActivityInput): ActivityEntry`",
      "- `interface LogActivityInput (8 members)` — what a log call takes",
      "",
      "- [`src/app/portal/page.tsx`](./files/src/app/portal/page.md) — the portal shell",
      "",
      "Some prose that locates nothing.",
    ].join("\n"));

    assert.deepEqual(entries.map(e => ({ file: e.file, symbol: e.symbol })), [
      { file: "src/server/activity.ts", symbol: "logActivity" },
      { file: "src/server/activity.ts", symbol: "LogActivityInput" },
      { file: "src/app/portal/page.tsx", symbol: undefined },
    ]);
    assert.equal(entries[2].text, "— the portal shell");
  });

  it("splits queries into usable terms and drops the question-shaped noise", () => {
    assert.deepEqual(queryTerms("Where is the Checkout, page?"), ["checkout", "page"]);
    assert.deepEqual(queryTerms("aquaTagBridge.ts"), ["aquatagbridge.ts"]);
    assert.deepEqual(queryTerms("a  b c"), []);
    assert.deepEqual(queryTerms("where is the"), [], "all filler is an empty query, not a search for 'the'");
    assert.deepEqual(queryTerms(""), []);
  });
});
