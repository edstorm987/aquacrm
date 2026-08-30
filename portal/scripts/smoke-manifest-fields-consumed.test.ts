// Manifest fields that nothing reads.
//
// ── Why this file exists ─────────────────────────────────────────────────
//
// Twice on 2026-08-28 the same bug turned up in a different costume: something
// DECLARED, in a shape that reads like a working feature, that no code anywhere
// consumes.
//
//   • `email-sender`'s `EVENT_SUBSCRIPTIONS` — whose own comment says
//     "Foundation's R6 router reads this list … and subscribes". No such router
//     exists, so four declared email triggers never fire.
//   • Every client-scoped plugin's `navItems` — 33 items across six modules,
//     rendered nowhere, because the client workspace never called the sidebar
//     builder. (Fixed the same day.)
//
// A declaration with no consumer is worse than a missing feature. It reads as
// done, it survives review, it gets copied into the next module, and the only
// way to discover the truth is to use the product and notice nothing happened.
//
// So the whole `AquaPlugin` surface was swept. These are what came back. The
// list is a RATCHET, in the same shape as the vendored-contract one: a new
// unconsumed field fails, and an entry that gains a consumer ALSO fails, so the
// list can only ever shrink.
//
// ── What this file does NOT claim ────────────────────────────────────────
//
// It does not say these fields should be implemented. `storefront` blocks are a
// real product decision with real UX behind them, and inventing one would be
// worse than naming the gap. It says only: right now a module author writing
// one of these gets silence, and nothing in the type tells them so.
//
// `setup` left this list on 2026-08-29, and how it left is the point. It was
// NOT resolved by building the UI its note described — that path forwards
// answers to ten `onInstall` implementations, none of which read them, so a
// form built over it would have discarded a live Stripe secret key. It was
// resolved by finding the one part of the field that could be honestly
// consumed (`fields[].required`, the only required-marker in the manifest) and
// leaving the dead half dead, with the contract updated to say which is which.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const MODULES_DIR = "src/built-ins/modules";

/** Host source — everything that could plausibly consume a manifest field. */
const HOST_DIRS = ["src/built-ins/runtime", "src/lib", "src/app", "src/server", "src/components"];

/** Files that define or re-publish the contract rather than consuming it. */
const CONTRACT_FILES = /_types\.ts$|aquaPluginTypes\.ts$/;

function hostSources(): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const walk = (dir: string) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        // A module's own source is not a consumer of the platform contract.
        if (path.includes("built-ins/modules")) continue;
        walk(path);
      } else if (/\.tsx?$/.test(entry.name) && !CONTRACT_FILES.test(path)) {
        out.push({ path, text: readFileSync(path, "utf8") });
      }
    }
  };
  for (const dir of HOST_DIRS) walk(dir);
  return out;
}

/**
 * Does the host read this field off a plugin/manifest anywhere?
 *
 * Property access, bracket access, or destructuring. Deliberately GENEROUS —
 * a false "yes" only shrinks this list, and a shrinking list is the safe
 * direction for a ratchet whose job is to catch new silence.
 */
function consumerCount(field: string, sources: ReturnType<typeof hostSources>): number {
  const patterns = [
    new RegExp(`\\.${field}\\b`),
    new RegExp(`\\[["']${field}["']\\]`),
    new RegExp(`\\{[^}]*\\b${field}\\b[^}]*\\}\\s*=`),
  ];
  return sources.filter(source =>
    patterns.some(pattern => pattern.test(source.text))
    // A mention inside a comment is not a consumer.
    && source.text.split("\n").some(line => {
      const code = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
      return patterns.some(pattern => pattern.test(code));
    })).length;
}

function modulesDeclaring(field: string): string[] {
  return readdirSync(MODULES_DIR).filter(id => {
    try {
      return new RegExp(`^\\s{2}${field}:`, "m").test(readFileSync(`${MODULES_DIR}/${id}/index.ts`, "utf8"));
    } catch { return false; }
  });
}

/**
 * The known-unconsumed set, as of 2026-08-28. Shrink it; never grow it without
 * reading the note above.
 *
 * **Already shrunk once, the day it was written.** `healthcheck` was the
 * largest entry — ten of the thirteen modules implement one and nothing called
 * any of them. It now has a consumer in
 * `app/api/portal/plugins/health/route.ts`, and this list's own assertion is
 * what said so: it failed with "shrink the list when that changes" the moment
 * the route landed. That is the ratchet working in the direction it was built
 * for, and it is the reason the remaining entries are worth trusting.
 */
const UNCONSUMED: Array<{ field: string; declaredBy: string[]; note: string }> = [
  {
    field: "storefront",
    declaredBy: ["affiliates", "client-crm", "ecommerce", "memberships", "website-editor"],
    note:
      "Five modules declare storefront blocks and nothing registers them. Crucially this is NOT a "
      + "forgotten consumer: THREE of the five — affiliates, client-crm, memberships — say 'Renderer "
      + "ships in T3' in their own block descriptions, so their blocks have no renderer at all. "
      + "Wiring a consumer would drop non-functional blocks into the editor palette, which is the "
      + "exact failure blockBackends.ts exists to prevent. The editor's own 70 blocks work because "
      + "its code imports BLOCK_DESCRIPTORS directly — this declaration is not what makes them work, "
      + "which is why the gap stayed invisible. The canonical contract now says all of this at the "
      + "field itself. (`routes` and `headInjections` are SUB-FIELDS of this one, not separate "
      + "findings — an earlier version of this list wrongly counted them as top-level fields.)",
  },
];

describe("manifest fields the host actually consumes", () => {
  const sources = hostSources();

  it("reads a real slice of the host to check against", () => {
    // Guards the guard: an empty file list would make every field look unconsumed.
    assert.ok(sources.length > 300, `expected the host sources, walked ${sources.length}`);
    // And a field known to be consumed must register as consumed, or the
    // detector is broken in the direction that invents findings.
    assert.ok(consumerCount("pages", sources) > 3, "the detector must see a field that IS consumed");
    assert.ok(consumerCount("navItems", sources) > 0, "…including one this session wired up");
  });

  for (const entry of UNCONSUMED) {
    it(`"${entry.field}" is still unconsumed — shrink the list when that changes`, () => {
      assert.equal(
        consumerCount(entry.field, sources),
        0,
        `\`${entry.field}\` now has a consumer in the host. That is good news: delete its entry from `
        + "UNCONSUMED so the list keeps shrinking, and check whether the modules declaring it "
        + `(${entry.declaredBy.join(", ") || "none"}) now behave as their manifests always claimed.`,
      );
    });

    it(`"${entry.field}" is still declared by exactly the modules named`, () => {
      // If a module STOPS declaring it, the note goes stale; if a NEW module
      // starts, somebody has just written a declaration that does nothing and
      // should be told before they ship it.
      assert.deepEqual(
        modulesDeclaring(entry.field).sort(),
        [...entry.declaredBy].sort(),
        `Modules declaring \`${entry.field}\` have changed. Nothing consumes this field, so a new `
        + "declaration silently does nothing — either wire it up, or drop it from the manifest.",
      );
    });
  }

  it("the contract WARNS at each unconsumed field, where an author will read it", () => {
    // The list in this file is only read by someone who already suspects a
    // problem. The person about to declare `storefront` blocks is, by
    // definition, not suspicious — they are in `_types.ts` looking at the
    // field, and until 2026-08-28 it said nothing. A warning that can be
    // silently deleted is no warning, so its presence is asserted here.
    const contract = readFileSync("src/built-ins/runtime/_types.ts", "utf8");
    for (const entry of UNCONSUMED) {
      const declaration = new RegExp(`\\n  ${entry.field}\\??:`);
      const at = contract.search(declaration);
      assert.notEqual(at, -1, `\`${entry.field}\` must still exist on AquaPlugin`);
      // The doc comment immediately above the field.
      const preceding = contract.slice(Math.max(0, at - 2200), at);
      assert.match(
        preceding,
        /Nothing (renders|registers)/,
        `\`${entry.field}\` is declared and consumed by nothing, but the contract does not say so at `
        + "the field. Someone will fill it in and get silence. Restore the warning, or wire a "
        + "consumer and remove the entry from UNCONSUMED.",
      );
      assert.match(
        preceding,
        /smoke-manifest-fields-consumed/,
        `the warning on \`${entry.field}\` must point at this file, so the reader can see what else `
        + "is in the same state",
      );
    }
  });

  it("no OTHER manifest field has quietly lost its consumer", () => {
    // The ratchet's other half. Every field on AquaPlugin is checked, so a
    // field that stops being read — the `navItems` failure mode, which went
    // unnoticed for months — fails here instead of going quiet in the product.
    const contract = readFileSync("src/built-ins/runtime/_types.ts", "utf8");
    const start = contract.indexOf("export interface AquaPlugin");
    const body = contract.slice(start, contract.indexOf("\n}", start));
    const fields = [...body.matchAll(/^\s{2}([a-zA-Z][A-Za-z0-9]*)\??:/gm)].map(match => match[1]!);
    assert.ok(fields.length > 15, `expected the AquaPlugin field list, parsed ${fields.length}`);

    const known = new Set(UNCONSUMED.map(entry => entry.field));
    const newlySilent = fields.filter(field => !known.has(field) && consumerCount(field, sources) === 0);
    assert.deepEqual(
      newlySilent,
      [],
      "These manifest fields are declared in the AquaPlugin contract and read by NOTHING in the host. "
      + "A module author filling one in gets silence, and the product looks configured when it is "
      + `not:\n  ${newlySilent.join("\n  ")}`,
    );
  });
});
