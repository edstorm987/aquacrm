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

describe("client-scoped browser state", () => {
  it("login customisation is stored per client, not once per browser", () => {
    // Found in the 2026-08-28 route sweep. `CustomisePage` is mounted per
    // client at `/portal/clients/[clientId]/customise`, but the customisation
    // was written to a single global localStorage key. Customising one client
    // and opening another showed the FIRST client's settings — and saving
    // there overwrote them. One browser, every client, one slot.
    const source = read(`${MODULE}/lib/loginCustomisation.ts`);

    assert.match(source, /function storageKey\(\)/, "the key must be derived, not a constant");
    assert.match(source, /\$\{KEY_PREFIX\}:\$\{clientId\}/, "and derived from the client currently being edited");
    // No bare use of the prefix as a whole key — that is the bug returning.
    assert.doesNotMatch(
      source,
      /localStorage\.(get|set|remove)Item\(\s*KEY_PREFIX\s*[,)]/,
      "writing to the unscoped prefix is the cross-client bleed this fixed",
    );
    // `[^,)]+` would stop at the first `)` and capture "storageKey(" — the
    // kind of near-miss that makes an assertion look strict while testing
    // nothing. Match the call form directly instead.
    for (const call of source.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*([A-Za-z_$][\w$]*(?:\(\))?)/g)) {
      assert.equal(call[1], "storageKey()", `storage must go through storageKey(), saw ${call[1]}`);
    }
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
