// Editor features that have no server — and the UI telling the truth about it.
//
// Found by the 2026-08-28 production-grade audit. `lib/funnels.ts` and
// `lib/splitTests.ts` fetch from routes that do not exist. That on its own is a
// known Round-2 gap, stated in both files' headers. What made it a DEFECT was
// what the UI did with it:
//
//   • a 404 became an empty cache, so the editor rendered "no funnels" —
//     indistinguishable from a genuine empty state;
//   • "New funnel" let somebody type a name, press Create, and answered
//     **"Failed to create funnel."** — wording that invites a retry of
//     something that can never succeed.
//
// ── The two ways this can rot ────────────────────────────────────────────
//
// 1. The route gets built and the entry is left behind, so the editor tells
//    people a working feature is broken. Guarded by asserting each declared
//    gap's route really is absent.
// 2. The message drifts back to a hardcoded string. Guarded by asserting the
//    modal reads its wording from the gap list.

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const MODULE = "src/built-ins/modules/website-editor/src";

describe("editor features with no backend", () => {
  it("declares a gap only while the route is genuinely missing", async () => {
    const { FEATURE_BACKEND_GAPS } = await import(`../${MODULE}/lib/featureBackends`);
    assert.ok(FEATURE_BACKEND_GAPS.length > 0, "the list must not be empty while gaps exist");

    const handlers = readdirSync(`${MODULE}/api/handlers`).map(name => name.replace(/\.ts$/, ""));

    for (const gap of FEATURE_BACKEND_GAPS) {
      // The app-router route.
      const appRoute = `src/app/api/portal/website-editor/${gap.id}/route.ts`;
      // The plugin's own handler, which is where the editor's other twenty live.
      const handlerNames = [gap.id, gap.id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];

      const routeExists = existsSync(appRoute);
      const handlerExists = handlerNames.some(name => handlers.includes(name));

      assert.equal(
        routeExists || handlerExists,
        false,
        `"${gap.id}" is declared as having no backend, but a route or handler now exists. `
        + "Delete its entry from FEATURE_BACKEND_GAPS — an entry that outlives its gap tells "
        + "people a working feature is broken.",
      );
    }
  });

  it("the New funnel modal states the real cause instead of a retryable error", () => {
    const editor = read(`${MODULE}/pages/EditorPage.tsx`);

    assert.match(editor, /featureBackendGap\("funnels"\)/, "the modal must consult the gap list");
    // The wording comes FROM the list, so it cannot drift from the reason.
    assert.match(editor, /setError\(funnelGap \? funnelGap\.reason : "Failed to create funnel\."\)/,
      "the failure message must name the real cause when one is known");
    // And the reason is shown BEFORE the name field, not only after a submit —
    // letting somebody fill a form that cannot succeed is the same mask.
    assert.match(editor, /funnelGap \? \(\s*<p[^>]*>\{funnelGap\.reason\}<\/p>/,
      "the reason must be shown up front, not only on failure");
    // Offering a button that cannot succeed is that mask in a third place.
    assert.match(editor, /disabled=\{busy \|\| Boolean\(funnelGap\)\}/, "Create must be disabled while there is no backend");
  });

  it("the Split tab states the real cause instead of an empty list", () => {
    // The same mask as funnels, one tab over. `listGroups()` turns the 404
    // from the missing `/split-tests` route into `[]`, so the tab rendered
    // "Block is not in any split-test group yet." — word for word what a
    // genuine empty state says — under a banner claiming "exposures +
    // conversions are tracked", which nothing performs. Create then answered
    // "Could not create group", inviting a retry that can never work.
    const panel = read(`${MODULE}/components/canvas/PropertiesPanel.tsx`);

    assert.match(panel, /featureBackendGap\("split-tests"\)/, "the tab must consult the gap list");

    // Shown BEFORE the list, not only after a failed create — so both branches
    // of the banner are read, and each is checked for what it may claim.
    // Strip comments first: the branch's own explanation QUOTES the claim it
    // exists to remove, and a test that failed on its own documentation would
    // be the mirror image of one that passed by matching it.
    const jsx = panel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const banner = /\{splitGap \? \(([\s\S]*?)\) : \(([\s\S]*?)\)\}/.exec(jsx);
    assert.ok(banner, "the banner must branch on the gap, up front");
    const [, whenGap, whenNoGap] = banner;
    assert.match(whenGap, /\{splitGap\.reason\}/, "the wording must come from the list, so it cannot drift");
    // The measurement claim is only true once something measures.
    assert.doesNotMatch(
      whenGap, /exposures \+ conversions are tracked/,
      "nothing tracks exposures while the split-test API does not exist",
    );
    assert.match(
      whenNoGap, /exposures \+ conversions are tracked/,
      "and the claim must survive on the branch taken once the route lands",
    );
    // A genuine empty state and an unbuilt feature must not read alike.
    assert.match(
      panel, /memberGroups\.length === 0 && !splitGap/,
      "\"not in any group yet\" must not be shown when the feature has no server",
    );
    // And a control that cannot succeed must not be offered.
    assert.match(panel, /disabled=\{Boolean\(splitGap\)\}/, "Create must be disabled while there is no backend");
    assert.match(
      panel, /setError\(splitGap \? splitGap\.reason : "Could not create group"\)/,
      "and the failure message must name the real cause when one is known",
    );
  });

  it("does not duplicate the block-level list", async () => {
    // `blockBackends.ts` answers the same question for palette blocks. The two
    // are deliberately separate — a block is what a visitor touches on a
    // published page, a feature is what the operator touches in the editor —
    // and merging them would make one list mean two things.
    const { FEATURE_BACKEND_GAPS } = await import(`../${MODULE}/lib/featureBackends`);
    const { BLOCK_BACKEND_GAPS } = await import(`../${MODULE}/lib/blockBackends`);
    // BLOCK_BACKEND_GAPS is keyed by block type; FEATURE_BACKEND_GAPS is a list.
    const featureIds = new Set(FEATURE_BACKEND_GAPS.map((gap: { id: string }) => gap.id));
    const overlap = Object.keys(BLOCK_BACKEND_GAPS).filter(id => featureIds.has(id));
    assert.deepEqual(overlap, [], "an id must live in one list or the other, never both");
  });
});

describe("retired browser-only editor state", () => {
  it("does not expose unconsumed panel, login, sidebar, section or popup controls", () => {
    const retired = [
      "lib/customise.ts",
      "lib/loginCustomisation.ts",
      "lib/sidebarLayout.ts",
      "lib/sections.ts",
      "lib/popup.ts",
    ];
    for (const file of retired) {
      assert.equal(existsSync(`${MODULE}/${file}`), false, `${file} must stay retired`);
    }

    const settings = read(`${MODULE}/pages/CustomisePage.tsx`);
    assert.doesNotMatch(settings, /localStorage/, "shared website settings must not be represented by a browser-only store");
    assert.match(settings, /\/api\/portal\/website-editor\/sites/, "site selection must read the tenant-scoped API");
    assert.match(settings, /\/api\/portal\/website-editor\/export\?siteId=/, "export must name the selected shared site");
  });

  it("the domain helpers do not claim success they cannot deliver", () => {
    // `domains.ts` described itself as returning "mock-success" so the SitesPage
    // flow would work, against a `/domains` proxy this plugin does not declare.
    // It has NO importer, so it was never reachable — but dead code that
    // pretends to succeed is a trap for whoever wires the proxy up, exactly
    // like `saveSettings` was.
    const source = read(`${MODULE}/lib/domains.ts`);
    assert.doesNotMatch(source, /mock-success/i, "the helpers must not advertise fake success");
    assert.doesNotMatch(source, /optimistic local responses/i, "nor optimistic local responses");
  });
});

describe("nothing reports a verification it did not perform", () => {
  it("verifyDomain refuses instead of stamping \"verified\"", () => {
    // The single most misleading thing found in the sweep: `verifyDomain` set
    // `status: "verified"` and stamped `verifiedAt` without making any call.
    // "Verified" is exactly the word an operator trusts, and there is no proxy
    // to verify against — this plugin declares no `/domains` route.
    const source = read(`${MODULE}/lib/domains.ts`);
    const fn = /export async function verifyDomain[\s\S]*?\n}/.exec(source);
    assert.ok(fn, "verifyDomain must still exist");
    assert.doesNotMatch(fn[0], /status: "verified"/, "it must not set a verified status it never checked");
    assert.doesNotMatch(fn[0], /verifiedAt/, "nor stamp a verification time");
    assert.match(fn[0], /available: false/, "it must say the check could not be made");
    assert.doesNotMatch(fn[0], /write\(/, "and must not mutate the stored status at all");
  });
});
