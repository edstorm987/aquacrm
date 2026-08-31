import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { INTERACTION_LABELS, sortInteractions, type PersonInteraction } from "../src/lib/inbox/personInteractions";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

function tsFilesUnder(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) tsFilesUnder(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function interaction(id: string, at: number, kind: PersonInteraction["kind"] = "enquiry"): PersonInteraction {
  return { id, kind, at, summary: id, fields: [] };
}

describe("you can see what you are being asked to classify", () => {
  // The card asked for a decision — sales, supplier, spam — while showing none
  // of the message it was asking about. That is a guess, not a decision.
  it("the card renders interactions", () => {
    const card = read("src", "app", "portal", "agency", "contacts", "[personId]", "_ContactCard.tsx");
    assert.match(card, /<Interactions interactions=\{interactions\}/);
  });

  it("expands the newest enquiry by default", () => {
    // Making somebody click to read the one thing they came for is one click
    // too many.
    const view = read("src", "app", "portal", "agency", "contacts", "[personId]", "_Interactions.tsx");
    assert.match(view, /defaultOpen=\{index === 0 && interaction\.kind === "enquiry"\}/);
  });

  it("shows every field the form captured, not a summary", () => {
    const gatherer = read("src", "lib", "server", "personInteractionsService.ts");
    for (const field of ["Preferred contact", "Services asked about", "Page", "Campaign"]) {
      assert.ok(gatherer.includes(field), `the form field "${field}" must be surfaced`);
    }
  });
});

describe("consent is visible without a click", () => {
  // Consent decides what you are allowed to do next; it was captured at
  // submission and never surfaced anywhere in the app.
  it("is exposed on the enquiry type", () => {
    const enquiries = read("src", "lib", "server", "websiteEnquiries.ts");
    for (const field of ["consent?:", "consentPurpose?:", "consentCapturedAt?:"]) {
      assert.ok(enquiries.includes(field), `WebsiteEnquiry must expose ${field}`);
    }
  });

  it("is selected from the database, not silently dropped", () => {
    const enquiries = read("src", "lib", "server", "websiteEnquiries.ts");
    assert.match(enquiries, /campaign, consent, created_at/, "the consent column must be selected");
  });

  it("is marked important so it is not buried among ordinary fields", () => {
    const gatherer = read("src", "lib", "server", "personInteractionsService.ts");
    assert.match(gatherer, /label: "Consent given"[\s\S]{0,400}important: true/);
  });

  it("shows on the collapsed row, not only when expanded", () => {
    const view = read("src", "app", "portal", "agency", "contacts", "[personId]", "_Interactions.tsx");
    assert.match(view, /Consented|No consent|Consent unknown/);
  });

  it("distinguishes 'no consent' from 'not recorded'", () => {
    // Treating an unrecorded consent as a refusal, or as permission, are both
    // wrong in different directions.
    const gatherer = read("src", "lib", "server", "personInteractionsService.ts");
    assert.match(gatherer, /"Not recorded"/);
  });
});

describe("interactions read newest first", () => {
  it("puts the most recent at the top", () => {
    const sorted = sortInteractions([interaction("old", 1), interaction("new", 3), interaction("mid", 2)]);
    assert.deepEqual(sorted.map(i => i.id), ["new", "mid", "old"]);
  });

  it("labels every kind it can hold", () => {
    for (const kind of ["enquiry", "reply", "call", "meeting", "note"] as const) {
      assert.ok(INTERACTION_LABELS[kind], `${kind} needs a label`);
    }
  });
});

// Six concepts exist twice on purpose — a client-safe pure half in
// `src/lib/<domain>/` and an IO half in `src/lib/server/`. That split is the
// architecture, not duplication to delete. What it is NOT allowed to do is wear
// the SAME filename on both halves: an autocomplete or a hand-typed import then
// silently picks the wrong one, and the pure half has no way to refuse a
// server-only caller. The rule recorded at
// docs/workspace/hazards-and-duplication.md ("Twin filenames across the lib
// halves") is that the server counterpart carries the `Service` suffix, never
// the bare twin name.
describe("the server half of a client-safe module never wears the bare twin name", () => {
  // The concepts named as hand-synced twins in hazards-and-duplication.md
  // ("Drift-prone twins (same concept, lib/ pure + lib/server/ IO)") that still
  // HAVE both halves. That doc names six; `clientRadar` and `kpiRegistry` are
  // deliberately absent here because neither has a `src/lib/server` half left to
  // name (`kpiRegistry` is pure-only at lib/performance/, `clientRadar` has no
  // lib file at all) — asserting a Service file for them would pin a fiction.
  const TWIN_CONCEPTS = [
    "clientTelemetry",
    "commandIntelligence",
    "brandPortfolio",
    "advisorSkills",
    "personInteractions",
  ];

  const serverFiles = tsFilesUnder(join(ROOT, "src", "lib", "server"))
    .map(p => p.slice(p.lastIndexOf("/") + 1));

  for (const concept of TWIN_CONCEPTS) {
    it(`${concept}'s server half is ${concept}Service, not ${concept}`, () => {
      assert.ok(
        serverFiles.includes(`${concept}Service.ts`),
        `the server half of ${concept} must be named ${concept}Service.ts`,
      );
      assert.ok(
        !serverFiles.includes(`${concept}.ts`),
        `a file named ${concept}.ts under src/lib/server collides with its client-safe half — rename it ${concept}Service.ts`,
      );
    });
  }

  it("the person-interactions gatherer is imported under its Service name", () => {
    const page = read("src", "app", "portal", "agency", "contacts", "[personId]", "page.tsx");
    assert.match(page, /from "@\/lib\/server\/personInteractionsService"/);
    assert.ok(
      !/from "@\/lib\/server\/personInteractions"/.test(page),
      "the contact page must not import the retired bare-name path",
    );
  });

  // A sweep, so a NEW twin cannot be introduced unnoticed. The two pairs below
  // are real outstanding violations of the same rule, recorded here rather than
  // hidden: they are chrome preference cookies owned by the topbar, not by this
  // suite. Fixing them should shrink this list, never grow it.
  const KNOWN_UNRESOLVED = ["devIconPreference.ts", "performanceMode.ts"];

  it("no other filename is shared across the two lib halves", () => {
    const libRoot = join(ROOT, "src", "lib");
    const serverRoot = join(libRoot, "server");
    const all = tsFilesUnder(libRoot);
    const pureNames = new Set(
      all.filter(p => !p.startsWith(serverRoot + "/")).map(p => p.slice(p.lastIndexOf("/") + 1)),
    );
    const collisions = all
      .filter(p => p.startsWith(serverRoot + "/"))
      .filter(p => pureNames.has(p.slice(p.lastIndexOf("/") + 1)))
      .map(p => relative(libRoot, p));

    const unexpected = collisions.filter(p => !KNOWN_UNRESOLVED.includes(p.slice(p.lastIndexOf("/") + 1)));
    assert.deepEqual(
      unexpected,
      [],
      `these server modules collide by name with a client-safe half: ${unexpected.join(", ")}`,
    );
    assert.deepEqual(
      collisions.map(p => p.slice(p.lastIndexOf("/") + 1)).sort(),
      [...KNOWN_UNRESOLVED].sort(),
      "the outstanding bare-name twins changed — update KNOWN_UNRESOLVED to match reality",
    );
  });
});
