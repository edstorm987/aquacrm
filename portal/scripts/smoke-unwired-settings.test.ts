// Settings fields that save a value nothing reads.
//
// ── The measurement, 2026-08-28 ──────────────────────────────────────────
//
// The thirteen modules declare **51 settings fields**. **25 are referenced
// exactly once in the whole repository — by the manifest line declaring them.**
// The saved value is never consulted by anything.
//
// This is the sharpest form of the "declared, never wired" defect this session
// kept finding, because of how it FEELS to the operator. A missing feature
// looks missing. A settings field accepts your input, saves without error, and
// shows your value back on reload — there is no way to tell it from one that
// works. Two of them are shaped like safety controls
// (`public-funnel/issueSessionCookie`, `agency-hr/canStaffEdit`), which is
// where a false belief costs the most.
//
// The fix is the codebase's own: label it where the promise is made. The panel
// marks these fields "Not connected". This file is what stops the label going
// stale in either direction.
//
// ── Why the detector is written the way it is ────────────────────────────
//
// It must not invent findings. So the reference test is GENEROUS — a field
// counts as read if its id appears anywhere in the module or the host outside
// the declaring line, in quotes or as a property. A false "wired" only shrinks
// the list; a false "unwired" would put a scary label on a working control.
// And it carries guards-the-guard: it must find ~51 fields and must classify a
// known-wired field as wired, or it is measuring nothing.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import ts from "typescript";

import { UNWIRED_SETTINGS, isSettingUnwired, unwiredKey } from "../src/lib/plugins/unwiredSettings";
import { listPlugins } from "../src/built-ins/runtime/_registry";
import type { AquaPlugin } from "../src/built-ins/runtime/_types";

/**
 * Files that TALK ABOUT these fields rather than reading them.
 *
 * `unwiredSettings.ts` names all 25 ids, and it lives under `src/lib` — so on
 * the first run of this test every one of them looked "read", by the very list
 * asserting they are not. A detector that its own findings disarm is worse than
 * no detector, because it reports a clean sweep.
 *
 * `lib/integrations/catalog.ts` is the same shape of file for a different
 * subject: it DECLARES the field ids an integration provider asks for
 * (`{ id: "fromName", label: "Sender name" }` for SMTP/Milesymedia). It reads no
 * plugin install config at all. Added 2026-08-30, because that one line was the
 * ONLY thing in the repository making `leads-pipeline/fromName` look consulted —
 * an id collision between an SMTP credential and a plugin setting. The module
 * that declares it contains zero occurrences of `install.config`, so nothing
 * there can read any setting; a hub row justified by "read for real when a blast
 * is composed" was resting on this collision. Excluding a declaration file makes
 * the sweep STRICTER (one more finding), which is the direction that costs the
 * operator nothing but an honest label.
 */
const NOT_A_READER = /lib\/plugins\/unwiredSettings\.ts$|lib\/integrations\/catalog\.ts$/;

interface HostReader {
  path: string;
  pattern: RegExp;
}

/**
 * A host-side read only counts when the full plugin/field identity names the
 * exact file and access expression. Matching a bare quoted field id across all
 * host source confused Client CRM's `defaultTags` setting with an unrelated
 * Leads CSV FormData key of the same name.
 */
const HOST_READERS: Readonly<Record<string, readonly HostReader[]>> = {
  "fulfillment/defaultStage": [{
    path: "src/app/api/portal/fulfillment/clients/route.ts",
    pattern: /fulfillmentInstall\??\.config\.defaultStage\b/,
  }],
  "agency-finance/defaultCurrency": [{
    path: "src/engines/data/server/kpi/companyHealthSnapshot.ts",
    pattern: /financeInstall\.config\.defaultCurrency\b/,
  }],
};

function withoutComments(source: string): string {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  let cursor = 0;
  let output = "";
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const start = scanner.getTokenPos();
    const end = scanner.getTextPos();
    output += source.slice(cursor, start);
    output += source.slice(start, end).replace(/[^\r\n]/g, " ");
    cursor = end;
  }
  return output + source.slice(cursor);
}

function hostReads(key: string): boolean {
  return (HOST_READERS[key] ?? []).some(reader =>
    reader.pattern.test(withoutComments(readFileSync(reader.path, "utf8"))));
}

function readTree(dir: string, skip: RegExp): string[] {
  const out: string[] = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!skip.test(path)) out.push(...readTree(path, skip));
    } else if (/\.tsx?$/.test(entry.name) && !NOT_A_READER.test(path)) {
      out.push(readFileSync(path, "utf8"));
    }
  }
  return out;
}

function moduleSource(id: string): string {
  const files = readTree(`src/built-ins/modules/${id}/src`, /node_modules|__smoke__/);
  try { files.push(readFileSync(`src/built-ins/modules/${id}/index.ts`, "utf8")); } catch { /* none */ }
  return files.join("\n");
}

let plugins: AquaPlugin[] = [];

before(() => {
  plugins = listPlugins().filter(plugin => !plugin.id.startsWith("zz-"));
});

/** Every declared field, and whether anything reads its saved value. */
function sweep(): { total: number; unwired: string[] } {
  const unwired: string[] = [];
  let total = 0;
  for (const plugin of plugins) {
    const own = withoutComments(moduleSource(plugin.id));
    for (const group of plugin.settings?.groups ?? []) {
      for (const field of group.fields ?? []) {
        total += 1;
        // Remove the declaring line(s) before asking whether anything reads it.
        const withoutDeclaration = own.replace(new RegExp(`id:\\s*["']${field.id}["']`, "g"), "");
        const key = unwiredKey(plugin.id, field.id);
        const read = new RegExp(`["']${field.id}["']`).test(withoutDeclaration)
          || new RegExp(`\\.${field.id}\\b`).test(withoutDeclaration)
          || hostReads(key);
        if (!read) unwired.push(key);
      }
    }
  }
  return { total, unwired: unwired.sort() };
}

describe("settings fields that nothing reads", () => {
  it("the detector is measuring something", () => {
    const { total } = sweep();
    assert.ok(total > 40, `expected the modules' declared settings fields, counted ${total}`);
    for (const [key, readers] of Object.entries(HOST_READERS)) {
      assert.ok(readers.length > 0 && hostReads(key), `${key} has stale host-reader evidence`);
    }
    // And a field that IS read must classify as read, or every result is noise.
    //
    // The anchor must be a field read by CODE. It used to be
    // `client-crm/customAttributeSchema`, which turned out to be read by
    // nothing — it classified as wired because its own Settings page mentioned
    // `install.config.<id>` in a comment, so the guard was resting on prose and
    // would have survived the field being deleted outright. Re-anchored
    // 2026-08-30 on `affiliates/defaultPayoutMethod`, which
    // `affiliates/src/api/handlers.ts` consults when it creates a payout.
    const { unwired } = sweep();
    assert.ok(
      !unwired.includes("affiliates/defaultPayoutMethod"),
      "a field the module genuinely reads must not be reported unwired — the detector is inverted",
    );
    assert.ok(
      unwired.includes("client-crm/defaultTags"),
      "an unrelated Leads CSV FormData key must not make Client CRM defaultTags look consumed",
    );
  });

  it("the declared list matches the code, in both directions", () => {
    const { unwired } = sweep();
    const declared = UNWIRED_SETTINGS.map(entry => unwiredKey(entry.pluginId, entry.fieldId)).sort();
    assert.deepEqual(
      unwired,
      declared,
      "The set of settings fields nothing reads has changed.\n"
      + "  • A field ADDED here is a new mask: it will save the operator's input and ignore it. "
      + "Wire it, or add it to UNWIRED_SETTINGS so the panel says so.\n"
      + "  • A field MISSING here is good news — something now reads it. Remove it from "
      + "UNWIRED_SETTINGS so the panel stops calling a working control broken.",
    );
  });

  it("the two that read like safety controls are still named", () => {
    // Not just "the list is right" — these two are why the label matters, and a
    // future edit that quietly drops them should have to argue with this.
    assert.ok(isSettingUnwired("public-funnel", "issueSessionCookie"),
      "a default-true toggle that reads as 'do not issue a session' must be labelled while it does nothing");
    assert.ok(isSettingUnwired("agency-hr", "canStaffEdit"),
      "an edit-permission toggle must be labelled while nothing reads it — the access kernel is what "
      + "actually enforces editing, so this control changes nothing and must not imply otherwise");
  });
});

describe("the panel tells the operator", () => {
  const panel = readFileSync("src/components/workspaces/PluginSettingsPanel.tsx", "utf8");

  it("marks an unwired field where the promise is made", () => {
    assert.match(panel, /isSettingUnwired\(pluginId, field\.id\)/,
      "each field must be asked about by id, at the field");
    assert.match(panel, /Not connected/, "…and carry a visible marker");
    assert.match(panel, /UNWIRED_SETTING_NOTICE/,
      "…and the explanation must come from the shared constant, so the wording cannot drift per screen");
  });

  it("the notice is associated with the input, not just placed near it", () => {
    // A warning a screen reader never reaches is a warning for sighted users only.
    assert.match(panel, /described \?\? noticeId/,
      "the input must be describedby the notice when there is no help text");
    assert.match(panel, /id=\{noticeId\}/, "…and the notice must carry that id");
  });
});
