// The duplication map must point at files that exist.
//
// `docs/workspace/hazards-and-duplication.md` exists to stop somebody building
// a THIRD copy of something. It does that by naming where the existing copies
// live. A path in it that leads nowhere is worse than no entry at all: the
// reader concludes the file was deleted, and writes their own.
//
// ── What the 2026-08-28 audit found ──────────────────────────────────────
//
// Seven paths were stale — every one a file that had been moved a directory
// deeper during a reorganisation the doc never caught up with:
//
//   lib/clientContacts.ts           → lib/clients/clientContacts.ts
//   lib/clientRelationshipRecord.ts → lib/clients/clientRelationshipRecord.ts
//   lib/server/clientRecordLedger.ts→ lib/server/clients/clientRecordLedger.ts
//   lib/clientContracts.ts          → lib/clients/clientContracts.ts
//   lib/kpiRegistry.ts              → lib/performance/kpiRegistry.ts
//   lib/server/mfa.ts               → lib/server/auth/mfa.ts
//   lib/server/devTeamRoadmap.ts    → lib/server/dev/devTeamRoadmap.ts
//
// Two of them named the pair at the heart of a real leak fixed the same day:
// the client-safe relationship record versus the internal ledger.
//
// ── Why this is not "every backticked filename must exist" ───────────────
//
// The doc also writes bare names as prose shorthand — `page.tsx`, `index.ts`,
// `layout.tsx` — after a sentence has already given the directory. Demanding
// those resolve produced **68 findings, almost all false**. A check that cries
// wolf 68 times is a check nobody runs.
//
// So a reference counts as a PATH CLAIM only when it contains a `/` and starts
// with a directory the repo actually has at the top of `src/`. And it resolves
// against three real layouts: repo-root, `src/`-relative, and relative to any
// plugin module's own `src/` — because the doc discusses plugin internals with
// module-relative paths, and missing that produced six more false findings.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const DOC = "docs/workspace/hazards-and-duplication.md";

/** Top-level directories under `src/` — a reference starting with one of these
 *  is claiming a real location rather than abbreviating. */
const SRC_ROOTS = ["lib", "server", "app", "components", "engines", "built-ins", "scripts", "styles"];

/**
 * Portal sections. The doc also writes paths relative to `src/app/portal/` —
 * `agency/performance/_AquaTagDashboard.tsx` — which the roots above do not
 * cover. Missing them let ONE stale path through the first version of this
 * check: `agency/aqua-tags/_AquaTagsWorkspace.tsx`, a file that actually lives
 * under `agency/fulfilment/`. Sixth narrowing, and the first that was too
 * narrow rather than too wide.
 */
const PORTAL_ROOTS = ["agency", "clients", "customer", "dev-team", "team"];

function pathClaims(doc: string): string[] {
  const referenced = [...doc.matchAll(/`([A-Za-z0-9_][A-Za-z0-9_/.[\]-]*\.(?:ts|tsx|css|mjs))`/g)]
    .map(match => match[1]);
  return [...new Set(referenced)]
    .filter(path => path.includes("/")
      && (SRC_ROOTS.includes(path.split("/")[0]) || PORTAL_ROOTS.includes(path.split("/")[0])));
}

function resolves(path: string, modules: string[]): boolean {
  if (existsSync(path) || existsSync(`src/${path}`) || existsSync(`src/app/portal/${path}`)) return true;
  return modules.some(module =>
    existsSync(`src/built-ins/modules/${module}/src/${path}`)
    || existsSync(`src/built-ins/modules/${module}/${path}`));
}

describe("hazards-and-duplication.md points at real files", () => {
  const doc = readFileSync(DOC, "utf8");
  const modules = readdirSync("src/built-ins/modules");
  const claims = pathClaims(doc);

  it("finds path claims to check", () => {
    // Guards the guard: if the extraction stops matching, every assertion below
    // passes over an empty list and proves nothing. The doc has dozens.
    assert.ok(claims.length > 20, `expected the doc's path claims, extracted ${claims.length}`);
  });

  it("every path claim resolves", () => {
    const broken = claims.filter(path => !resolves(path, modules)).sort();
    assert.deepEqual(
      broken,
      [],
      "These paths in the duplication map lead nowhere. A reader who follows one and finds nothing "
      + "concludes the file is gone and writes a third copy — which is the exact thing this document "
      + `exists to prevent:\n  ${broken.join("\n  ")}`,
    );
  });

  it("still names the pairs that caused real bugs", () => {
    // Not just "the paths resolve" — the entries that matter must still be there.
    // Both of these were stale, and both name modules involved in the
    // internal-call-notes leak fixed on 2026-08-28.
    assert.match(doc, /lib\/clients\/clientRelationshipRecord\.ts/, "the client-safe record must still be named");
    assert.match(doc, /lib\/server\/clients\/clientRecordLedger\.ts/, "and the internal ledger beside it");
    assert.match(doc, /server\/persons\.ts.*server\/people\.ts|persons\.ts.*people\.ts/s, "persons vs people must stay flagged");
  });
});

describe("the confusable pairs say so in the code, not only in the doc", () => {
  // `hazards-and-duplication.md` is only read by somebody who already suspects
  // a duplicate exists. The person about to build a third copy is, by
  // definition, not suspicious — they are in the file, and the file said
  // nothing.
  //
  // Before 2026-08-28: `people.ts` (1,857 lines of HR) carried no header at all
  // while `persons.ts` (the CRM) explained itself; neither contacts surface
  // named the other; and the three fulfilment surfaces — spelled `fulfilment`
  // and `fulfillment`, sharing no code — were distinguished by one letter and
  // nothing else.
  //
  // Each file below must now name its counterpart. Not prose for its own sake:
  // the test asserts the OTHER surface's path appears, so the reader is given
  // somewhere to go.

  const PAIRS: Array<{ file: string; mustMention: RegExp; why: string }> = [
    {
      file: "src/server/people.ts",
      mustMention: /persons\.ts/,
      why: "HR staff vs the CRM — a syllable apart, entirely different subjects",
    },
    {
      file: "src/server/persons.ts",
      mustMention: /people\.ts|facet/i,
      why: "the CRM side of the same confusion",
    },
    {
      file: "src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx",
      mustMention: /built-ins\/modules\/fulfillment/,
      why: "British-spelled workspace must point at the American-spelled plugin",
    },
    {
      file: "src/built-ins/modules/fulfillment/index.ts",
      mustMention: /fulfilment\//,
      why: "and the plugin must point back at the workspace",
    },
    {
      file: "src/app/portal/agency/contacts/_ContactsIndex.tsx",
      mustMention: /leads-pipeline\/contacts/,
      why: "canonical contacts must name the rolodex",
    },
    {
      file: "src/app/portal/agency/leads-pipeline/contacts/_ContactsWorkspace.tsx",
      mustMention: /agency\/contacts/,
      why: "and the rolodex must name the canonical one",
    },
    {
      file: "src/lib/clients/clientRelationshipRecord.ts",
      mustMention: /clientRecordLedger/,
      why: "client-safe record vs internal ledger — the pair behind the call-notes leak",
    },
    {
      file: "src/lib/server/clients/clientRecordLedger.ts",
      mustMention: /clientRelationshipRecord/,
      why: "internal ledger must name the client-safe record",
    },
    {
      file: "src/app/portal/agency/fulfilment/_AquaTagsWorkspace.tsx",
      mustMention: /_AquaTagDashboard/,
      why: "tag setup must name the analytics surface",
    },
    {
      file: "src/app/portal/agency/performance/_AquaTagDashboard.tsx",
      mustMention: /_AquaTagsWorkspace/,
      why: "and analytics must name the setup surface",
    },
  ];

  for (const pair of PAIRS) {
    it(`${pair.file.split("/").pop()} names its counterpart`, () => {
      // Only the header — a mention buried in code is not a warning.
      const header = readFileSync(pair.file, "utf8").slice(0, 3_000);
      assert.match(
        header,
        pair.mustMention,
        `${pair.file} must say near the top which surface it is and where the other lives (${pair.why}). `
        + "A developer in this file will not have read the hazards doc.",
      );
    });
  }
});
