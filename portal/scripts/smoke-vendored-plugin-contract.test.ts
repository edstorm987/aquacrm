// The thirteen vendored copies of the plugin contract must not disagree.
//
// Every built-in module carries its own `src/lib/aquaPluginTypes.ts`, and each
// one's header calls itself a "vendored copy of the canonical contract"
// with a TODO to replace it with an import. Thirteen copies, thirteen different
// files — 173 to 299 lines.
//
// ── What the 2026-08-28 audit found ──────────────────────────────────────
//
// A first pass with `awk` concluded "no drift — every shared type has exactly
// one definition". That was WRONG: the awk stopped at the first `}` and so
// compared truncated fragments that happened to match. A brace-balanced parser
// found real divergence, including one live bug:
//
//   • `PluginCategory` — four plugin manifests declared `category: "growth"`,
//     a member the CANONICAL type in `runtime/_types.ts` did not have. They
//     compiled only because each imports its own vendored copy. Fixed: the
//     canonical was widened and all thirteen copies aligned.
//
// Some divergence is legitimate. A module vendoring only the fields it uses is
// the entire point of vendoring, and demanding identical copies would be churn
// without safety.
//
// ── The invariant, and why it is not "make them identical" ───────────────
//
// Demanding identical copies would be wrong: a module vendoring only the fields
// it uses is the entire point of vendoring, and forcing every copy to be
// complete is churn without safety.
//
// What actually matters is CONTRADICTION:
//
//   • a union member set that differs — `PluginCategory` meaning one thing here
//     and another there;
//   • a field that appears in two copies with DIFFERENT types.
//
// Both mean one name denotes two things, which is the bug that only surfaces at
// a distance. Missing-but-not-conflicting is left alone.
//
// The proper fix remains the TODO each file already carries: one canonical
// contract, imported. Until then, this is the thing standing between "they
// happen to agree" and "they cannot disagree".

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { describe, it } from "node:test";

const moduleOf = (file: string) =>
  file.replace("src/built-ins/modules/", "").replace("/src/lib/aquaPluginTypes.ts", "");

const FILES = execSync("find src/built-ins -name aquaPluginTypes.ts", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

/**
 * Pull every top-level `export interface X { … }` / `export type X = …` body out
 * of one file, keyed by name.
 *
 * Comments are stripped and whitespace collapsed: a copy that is identical but
 * formatted differently, or carries its own note, is not a disagreement.
 */
interface Declaration { kind: "interface" | "alias"; body: string }

function declarations(source: string): Map<string, Declaration> {
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const found = new Map<string, Declaration>();

  // Interfaces: brace-balanced from the opening line.
  for (const match of clean.matchAll(/^export interface (\w+)[^{]*\{/gm)) {
    const name = match[1];
    let depth = 0;
    let index = clean.indexOf("{", match.index ?? 0);
    const start = index;
    for (; index < clean.length; index++) {
      if (clean[index] === "{") depth++;
      else if (clean[index] === "}") { depth--; if (depth === 0) break; }
    }
    found.set(name, { kind: "interface", body: clean.slice(start, index + 1).replace(/\s+/g, " ").trim() });
  }

  // Type aliases: to the terminating semicolon.
  for (const match of clean.matchAll(/^export type (\w+)\s*=([\s\S]*?);/gm)) {
    found.set(match[1], { kind: "alias", body: match[2].replace(/\s+/g, " ").trim() });
  }
  return found;
}

/**
 * Divergence that already existed when this test was written, 2026-08-28.
 *
 * A RATCHET, not an approval. Each entry is a real difference between vendored
 * copies, catalogued so that NEW drift fails while the existing backlog stays
 * visible instead of blocking the suite. The proper fix is the TODO every copy
 * carries — one canonical contract, imported — which is a thirteen-module
 * refactor and not something to slip into an audit pass.
 *
 * Shrink this list; never grow it. An entry removed because the divergence was
 * fixed is the point. An entry ADDED means somebody let two modules disagree.
 *
 * Notable ones, so the list is not just noise:
 *   • `BlockDescriptor.category` — `string` in five, a literal union in
 *     ecommerce, `BlockCategory` in website-editor.
 *   • `NavItem.panelId` — RESOLVED 2026-08-28, and the first read of it was
 *     wrong. It looked like the minority copy was the better one: twelve said
 *     `string`, ecommerce had a named `PanelId`. But the canonical `NavItem` in
 *     runtime/_types.ts types it `string` DELIBERATELY — `_validate.ts` warns
 *     on an unknown panel rather than failing, because plugin panels are still
 *     in flight — and ecommerce's union was missing "customer" and every
 *     plugin-specific panel in use. A narrower type that cannot express a valid
 *     nav item is not the better one. ecommerce now matches the canonical.
 *   • `PluginServices.*` (six fields) — VERIFIED DELIBERATE 2026-08-28. Ten
 *     copies type these `unknown`; fulfillment and website-editor give them
 *     real port types. Checked whether the ten actually consume those services:
 *     **none of them do.** `unknown` is the honest typing for a service a
 *     module never touches, and "fixing" it would vendor six more port
 *     interfaces into ten modules — sixty new copies to drift, for code nobody
 *     calls. Listed so the shape is pinned, NOT as pending work.
 *   • `AquaPlugin.storefront` — genuinely different capabilities: five modules
 *     contribute only blocks, ecommerce adds routes and head injections,
 *     website-editor has its own `StorefrontContributions`. Not one concept
 *     written three ways; three different contracts.
 *
 *   • `BlockDescriptor.category` — LEFT AS IS, and the canonical is the wrong
 *     side. `runtime/_types.ts` types it `"layout" | "content" | "commerce" |
 *     "form" | "media" | "marketing"`, but memberships, affiliates and
 *     client-crm ship blocks categorised `"membership"`, `"affiliate"` and
 *     `"crm"`. Narrowing the five `string` copies to the canonical union would
 *     break all three. Nothing in the runtime reads this field and the
 *     validator does not check it, so `string` is the honest typing —
 *     the same finding as `NavItem.panelId`.
 *
 * Everything else is resolved. `AquaPlugin.scopePolicy` and
 * `HeadInjection.render` were fixed on 2026-08-28.
 */
const KNOWN_DIVERGENCE = new Set([
  "AquaPlugin.storefront",
  "BlockDescriptor.category", "PluginServices.clients", "PluginServices.phases", "PluginServices.pluginInstalls",
  "PluginServices.pluginRuntime", "PluginServices.registry", "PluginServices.variants",
  
]);

/**
 * Split an interface body into its TOP-LEVEL fields.
 *
 * A naive `body.split(";")` breaks inside nested object types — a field like
 * `options?: { value: string; label: string }[]` becomes three fragments, two
 * of which look like fields named `label` and `value` with types `string }[]`.
 *
 * That is not hypothetical: the first version of this test did exactly that and
 * put `SetupField.label` and `HealthStatus.message` into the known-divergence
 * list as phantom conflicts — the SAME thirteen modules appearing on both sides
 * of a "disagreement". A ratchet full of entries that were never real is
 * precisely where real drift hides.
 */
function topLevelFields(body: string): string[] {
  const inner = body.slice(1, -1);
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  // Braces and parens only. Angle brackets CANNOT be counted here: every arrow
  // type contains `=>`, whose `>` has no matching `<`, so depth goes negative
  // and top-level `;` stop being seen. Generics never contain a bare `;`, so
  // ignoring them loses nothing. (Second bug in this parser, same afternoon.)
  for (const char of inner) {
    if (char === "{" || char === "(") depth++;
    else if (char === "}" || char === ")") depth--;
    if (char === ";" && depth === 0) { parts.push(current); current = ""; continue; }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

describe("vendored plugin contract copies", () => {
  it("finds every copy", () => {
    // A collector that found nothing would make the comparison below vacuous —
    // the failure mode this whole file exists to prevent.
    assert.ok(FILES.length >= 13, `expected the vendored copies, found ${FILES.length}`);
  });

  it("never gives one union two different member sets", () => {
    // A union that differs is unambiguous drift: `PluginCategory` accepted
    // "growth" in eight copies, "fulfillment" in one, and neither in four —
    // while four real plugin manifests declared `category: "growth"`, which the
    // CANONICAL type in runtime/_types.ts did not allow. They compiled only
    // because each imported its own copy. (Found and fixed 2026-08-28.)
    const variants = new Map<string, Map<string, string[]>>();
    for (const file of FILES) {
      for (const [name, decl] of declarations(readFileSync(file, "utf8"))) {
        if (decl.kind !== "alias") continue;             // real type aliases only
        const body = decl.body;
        if (!variants.has(name)) variants.set(name, new Map());
        const byBody = variants.get(name)!;
        const members = body.split("|").map(part => part.trim()).filter(Boolean).sort().join(" | ");
        if (!byBody.has(members)) byBody.set(members, []);
        byBody.get(members)!.push(moduleOf(file));
      }
    }

    const conflicts = [...variants.entries()]
      .filter(([name, byBody]) => byBody.size > 1 && !KNOWN_DIVERGENCE.has(name))
      .map(([name, byBody]) => `${name}: ${[...byBody.entries()].map(([m, mods]) => `[${mods.join(", ")}] => ${m}`).join("  ||  ")}`);

    assert.deepEqual(conflicts, [], `Unions disagree across vendored copies:\n  ${conflicts.join("\n  ")}`);
  });

  it("never gives one field two different types", () => {
    // Interfaces may legitimately be SUBSETS — a module vendors the fields it
    // uses. What must never happen is the same field name carrying a different
    // type in two modules, because both files then look correct in isolation
    // and only disagree where they meet.
    const fields = new Map<string, Map<string, string[]>>();
    for (const file of FILES) {
      for (const [name, decl] of declarations(readFileSync(file, "utf8"))) {
        if (decl.kind !== "interface") continue;
        const body = decl.body;
        for (const field of topLevelFields(body)) {
          const match = /^\s*(\w+\??)\s*:\s*(.+?)\s*$/.exec(field);
          if (!match) continue;
          const key = `${name}.${match[1].replace("?", "")}`;
          const type = match[2].replace(/\s+/g, " ").trim();
          if (!fields.has(key)) fields.set(key, new Map());
          const byType = fields.get(key)!;
          if (!byType.has(type)) byType.set(type, []);
          byType.get(type)!.push(moduleOf(file));
        }
      }
    }

    const conflicts = [...fields.entries()]
      .filter(([key, byType]) => byType.size > 1 && !KNOWN_DIVERGENCE.has(key))
      .map(([key, byType]) => `${key}: ${[...byType.entries()].map(([type, mods]) => `[${mods.join(", ")}] => ${type}`).join("  ||  ")}`);

    assert.deepEqual(conflicts, [], `The same field has different types across vendored copies:\n  ${conflicts.join("\n  ")}`);
  });

  it("the known-divergence list has no entries that are already fixed", () => {
    // A ratchet that never tightens is a ratchet nobody trusts. If a listed
    // divergence has been resolved, the entry must go — otherwise the list
    // slowly becomes a place where real drift can hide.
    const live = new Set<string>();
    const seenUnion = new Map<string, Set<string>>();
    const seenField = new Map<string, Set<string>>();
    for (const file of FILES) {
      for (const [name, decl] of declarations(readFileSync(file, "utf8"))) {
        if (decl.kind === "alias") {
          const members = decl.body.split("|").map(p => p.trim()).filter(Boolean).sort().join(" | ");
          if (!seenUnion.has(name)) seenUnion.set(name, new Set());
          seenUnion.get(name)!.add(members);
        } else {
          for (const field of topLevelFields(decl.body)) {
            const match = /^\s*(\w+\??)\s*:\s*(.+?)\s*$/.exec(field);
            if (!match) continue;
            const key = `${name}.${match[1].replace("?", "")}`;
            if (!seenField.has(key)) seenField.set(key, new Set());
            seenField.get(key)!.add(match[2].replace(/\s+/g, " ").trim());
          }
        }
      }
    }
    for (const [name, set] of seenUnion) if (set.size > 1) live.add(name);
    for (const [key, set] of seenField) if (set.size > 1) live.add(key);

    const stale = [...KNOWN_DIVERGENCE].filter(entry => !live.has(entry)).sort();
    assert.deepEqual(stale, [], `These no longer diverge — remove them from KNOWN_DIVERGENCE: ${stale.join(", ")}`);
  });

it("every copy of Role in the repo agrees with the canonical one", () => {
    // A SECOND vendored family, found in the same audit: `Role` is declared in
    // thirteen module `tenancy.ts` files as well as canonically in
    // `src/server/types.ts`. All thirteen had seven members; the canonical has
    // eight. The missing one was **"lead"** — so a plugin's types said a lead
    // user could not exist, while bos-auth-gate and public-funnel are
    // lead-facing surfaces and `smoke-lead-role` exercises the role for real.
    //
    // `Role` is the most fundamental type in the system. It meaning two
    // different things depending on which directory you are in is the exact
    // naming failure this audit was asked to find.
    const files = execSync('find src -name "*.ts" -not -name aquaPluginTypes.ts', { encoding: "utf8" })
      .split("\n").filter(Boolean);

    const byMembers = new Map<string, string[]>();
    for (const file of files) {
      // Comments stripped FIRST. Without this a `// …` note inside the union
      // becomes a "member" and every annotated copy reads as a disagreement —
      // which is exactly what happened on the first run of this check.
      const source = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const match = /^export type Role\s*=([\s\S]*?);/m.exec(source);
      if (!match) continue;
      const members = match[1].split("|").map(part => part.trim()).filter(Boolean).sort().join(", ");
      if (!byMembers.has(members)) byMembers.set(members, []);
      byMembers.get(members)!.push(file);
    }

    assert.ok(byMembers.size > 0, "no Role declarations found — this check has stopped working, not started passing");
    assert.equal(
      byMembers.size,
      1,
      `Role is declared ${byMembers.size} different ways:\n  `
      + [...byMembers.entries()].map(([members, where]) => `[${where.length}] ${members}\n      ${where.slice(0, 4).join(", ")}`).join("\n  "),
    );
    // And it must still be the canonical set, not thirteen copies that agree
    // with each other while disagreeing with src/server/types.ts.
    const [members] = [...byMembers.keys()];
    assert.match(members, /"lead"/, "the canonical Role includes \"lead\" — a copy that drops it cannot represent a lead user");
  });

  it("actually compared something", () => {
    // Guards the guard: if the parser stopped matching, every file would yield
    // an empty map and the conflict check above would pass while proving
    // nothing. The four below are present in all thirteen copies.
    const shared = declarations(readFileSync(FILES[0], "utf8"));
    for (const name of ["PluginStatus", "PluginCategory", "PluginStorage", "PluginCtx"]) {
      assert.ok(shared.has(name), `the parser no longer finds ${name} — it has stopped working, not started passing`);
    }
    assert.ok(shared.size >= 10, `expected a substantial contract, parsed ${shared.size} declarations`);
    // And that the two kinds are actually being told apart — the bug that made
    // the first version of this test compare interfaces as if they were unions.
    assert.equal(shared.get("PluginCategory")?.kind, "alias");
    assert.equal(shared.get("PluginCtx")?.kind, "interface");
  });
});
