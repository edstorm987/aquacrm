// The editor finally listens to the tag.
//
// Ed, repeatedly: "the aqua tag must be connected for browser to work … i get a
// browser and the right menu when i click on an item aqua tag knows the exact
// item since its mapped everything then i get the exact text i can change it on
// the right menu for just the words."
//
// Both halves of that already existed and they spoke different languages. The
// tag posted `aqua-explorer:selected` carrying an element; `DevEditor.tsx`
// listened for `aqua:portal-block-select` carrying a portal block id, and threw
// away anything whose origin was not its own — which is every tagged site there
// will ever be. Two rejections for the same message.
//
// What is pinned here:
//   1. The ROUTING rule — one click, three destinations — as a pure function,
//      including the invariant that broke it before (a mode must never be sent
//      to a tab that same mode does not offer).
//   2. The COMPOSITION — a real cross-origin tag message now survives the
//      origin policy and lands on the right tab, where the old rule dropped it.
//   3. The GATE — the browser is the Aqua Tag's question, not `projectKind`'s.
//   4. Source-level contracts on the listener itself, because it is a handler
//      inside a 2,000-line client component and the thing worth holding is that
//      each part of it still exists.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { EDITING_MODES, INSPECTOR_TABS, SURFACE_TABS, editingMode, inspectorTabsFor, type EditingMode } from "../src/engines/editor/editing/modes.ts";
import { routeTagSelection, modeSelectsThroughTag } from "../src/engines/editor/editing/selectionRouting.ts";
import {
  AQUA_TAG_MESSAGES,
  AQUA_TAG_PROTOCOL_VERSION,
  acceptAquaTagMessage,
  aquaTagBrowserUrl,
  aquaTagOrigin,
} from "../src/engines/editor/editing/aquaTagBridge.ts";
import { makeId } from "../src/engines/editor/elements/ids.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const editor = read("src", "engines", "editor", "DevEditor.tsx");
const routing = read("src", "engines", "editor", "editing", "selectionRouting.ts");
const studioRoute = read("src", "app", "portal", "dev-team", "editor", "studio", "page.tsx");
const assistant = read("src", "components", "editing", "AquaEditorAI.tsx");

// Three since 2026-08-22 — "Just the words" merged into Visual; its editable
// words live at the visual depth now.
const ALL_MODES: EditingMode[] = ["assist", "visual", "developer"];

/** What `explorerDescribe` actually builds, so the test is not a friendlier fiction. */
function selectedMessage(overrides: Record<string, unknown> = {}) {
  return {
    type: AQUA_TAG_MESSAGES.selected,
    version: AQUA_TAG_PROTOCOL_VERSION,
    element: {
      id: "aqua-element-7",
      tagName: "h1",
      kind: "text",
      label: "Stunning pools, built properly",
      text: "Stunning pools, built properly",
      styles: {
        color: "rgb(17, 19, 17)",
        backgroundColor: "rgba(0, 0, 0, 0)",
        fontSize: "44px",
        fontWeight: "700",
        textAlign: "left",
      },
      ...overrides,
    },
  };
}

describe("one selection mechanism, three destinations", () => {
  it("sends every depth somewhere real", () => {
    for (const mode of ALL_MODES) {
      const route = routeTagSelection(mode, { portalTarget: false });
      assert.ok(route.tab, `${mode} routes nowhere`);
      assert.ok(route.reason.trim(), `${mode} cannot say where the click went`);
      assert.equal(modeSelectsThroughTag(mode), true, `${mode} should select through the tag`);
    }
  });

  it("NEVER routes a mode to a tab that mode does not offer", () => {
    // This is the invariant that was actually broken. The old listener did
    // `setTab("builder")` for every message it accepted — and "builder" was
    // not a tab the then "Just the words" depth offered, so the tab-repair
    // effect immediately bounced the operator back to the assistant and the
    // words never appeared. That depth merged into Visual (2026-08-22); the
    // invariant outlives it.
    // A destination outside its own mode's tab list is not a routing choice,
    // it is a redirect to somewhere else.
    for (const mode of ALL_MODES) {
      for (const portalTarget of [true, false]) {
        const route = routeTagSelection(mode, { portalTarget });
        assert.ok(
          editingMode(mode).tabs.includes(route.tab),
          `${mode} (portalTarget=${portalTarget}) routes to "${route.tab}", which ${mode} does not offer`,
        );
      }
    }
  });

  it("the WORDS survived the merge — Visual gets them, editable", () => {
    // REWRITTEN 2026-08-22: this used to pin the "simple" depth ("Just the
    // words": element tab, editable words, no styles). The rung merged into
    // Visual — "its the same you select element change type it add it in" —
    // so the contract it carried moved here: off a portal, a visual-depth
    // selection still lands on the element panel with the exact words
    // editable. The one deliberate change: the styling sits beside them now,
    // because Ed decided against any "nothing can break" text-only gate.
    const route = routeTagSelection("visual", { portalTarget: false });
    assert.equal(route.tab, "element", "the words land in the element panel, not the builder");
    assert.equal(route.editWords, true, "and they are editable — that was the old depth's entire offer");
    assert.equal(route.editStyles, true, "the visual depth adds the styling — the merge's one behaviour change");
  });

  it("'Just tell it' differs the same selection to the AI", () => {
    const route = routeTagSelection("assist", { portalTarget: false });
    assert.equal(route.tab, "assistant");
    // Deliberately not editable: the same sentence must not be changeable in
    // two places at once while it is being described to the assistant.
    assert.equal(route.editWords, false);
  });

  it("the visual builder gets the builder on a portal, and the element anywhere else", () => {
    assert.equal(routeTagSelection("visual", { portalTarget: true }).tab, "builder");
    // A client's website or a game build has no portal document made of
    // blocks, so the builder would open with nothing in it.
    const offPortal = routeTagSelection("visual", { portalTarget: false });
    assert.equal(offPortal.tab, "element");
    assert.equal(offPortal.editStyles, true, "the visual depth carries the styling");
  });

  it("Dev is cumulative — all of them plus the source", () => {
    const route = routeTagSelection("developer", { portalTarget: false });
    assert.equal(route.editWords, true);
    assert.equal(route.editStyles, true);
    assert.equal(route.revealSource, true, "'all of them + the vs way'");
    for (const mode of ALL_MODES) {
      if (mode === "developer") continue;
      assert.equal(routeTagSelection(mode, { portalTarget: false }).revealSource, false,
        `${mode} should not claim the code surface`);
    }
  });

  it("quotes Ed rather than paraphrasing him, so the rule survives the next rewrite", () => {
    assert.match(routing, /just the words/i);
    assert.match(routing, /differ it to the ai/i);
  });
});

describe("a real tag message now survives the trip", () => {
  const frameWindow = { name: "the preview frame" };
  const site = "https://oceanboulevard.co.uk/pools";
  const policy = { allowedOrigin: aquaTagOrigin(site), frameWindow };

  it("derives an origin from the page the editor pointed the frame at", () => {
    assert.equal(policy.allowedOrigin, "https://oceanboulevard.co.uk");
  });

  it("accepts the selection the OLD rule threw away", () => {
    const event = { origin: "https://oceanboulevard.co.uk", source: frameWindow, data: selectedMessage() };
    // The old rule, verbatim: `if (event.origin !== window.location.origin) return;`
    const editorOrigin = "https://app.aquacrm.co.uk";
    assert.notEqual(event.origin, editorOrigin, "the tagged site is a different origin — that was the whole problem");

    const message = acceptAquaTagMessage(event, policy);
    assert.ok(message, "a correctly formed selection from the tagged frame must be accepted");
    assert.equal(message.type, AQUA_TAG_MESSAGES.selected);
    assert.equal(message.type === AQUA_TAG_MESSAGES.selected && message.element?.text,
      "Stunning pools, built properly", "and it must carry the EXACT text, unaltered");
  });

  it("lands on the right destination for each depth", () => {
    const message = acceptAquaTagMessage(
      { origin: "https://oceanboulevard.co.uk", source: frameWindow, data: selectedMessage() },
      policy,
    );
    assert.ok(message && message.type === AQUA_TAG_MESSAGES.selected && message.element);
    assert.deepEqual(
      ALL_MODES.map(mode => routeTagSelection(mode, { portalTarget: false }).tab),
      ["assistant", "element", "element"],
      "assist → the AI; visual/developer → the element panel on a non-portal page",
    );
  });

  it("still refuses a lookalike origin, a stray frame and a cleared policy", () => {
    const data = selectedMessage();
    // The attack an endsWith/startsWith check waves through.
    assert.equal(acceptAquaTagMessage(
      { origin: "https://oceanboulevard.co.uk.attacker.net", source: frameWindow, data }, policy), null);
    // Another frame on the SAME site — a nested ad iframe, say.
    assert.equal(acceptAquaTagMessage(
      { origin: "https://oceanboulevard.co.uk", source: { other: true }, data }, policy), null);
    // Nothing pointed at yet: fail closed, never open.
    assert.equal(acceptAquaTagMessage(
      { origin: "https://oceanboulevard.co.uk", source: frameWindow, data },
      { allowedOrigin: null, frameWindow }), null);
  });

  it("carries an image selection whole", () => {
    const message = acceptAquaTagMessage(
      {
        origin: "https://oceanboulevard.co.uk",
        source: frameWindow,
        data: selectedMessage({ kind: "image", text: undefined, src: "https://oceanboulevard.co.uk/hero.jpg", alt: "A finished pool" }),
      },
      policy,
    );
    assert.ok(message && message.type === AQUA_TAG_MESSAGES.selected && message.element);
    assert.equal(message.element.kind, "image");
    assert.equal(message.element.alt, "A finished pool");
  });
});

describe("the listener in DevEditor", () => {
  it("uses the shared bridge rather than retyping the protocol", () => {
    assert.match(editor, /acceptAquaTagMessage/, "must trust-then-parse through the bridge");
    assert.match(editor, /from "@\/engines\/editor\/editing\/aquaTagBridge"/);
    // A literal message name in this file is how the two halves drifted apart
    // in the first place. The portal-block protocol is a different, first-party
    // protocol and keeps its literal.
    assert.equal(/"aqua-explorer:/.test(editor), false,
      "no explorer message name may be retyped here — import it from the bridge");
  });

  it("no longer drops everything that is not same-origin", () => {
    // The exact line that made a tagged external site impossible.
    assert.equal(
      /if \(event\.origin !== window\.location\.origin\) return;/.test(editor),
      false,
      "the blanket same-origin drop must be gone",
    );
    // …but the origin is still CHECKED, through the policy, against the frame.
    assert.match(editor, /allowedOrigin: tagOriginRef\.current/);
    assert.match(editor, /frameWindow: previewRef\.current\?\.contentWindow/);
  });

  it("KEEPS the Aqua-hosted portal block path working", () => {
    // This was an addition, not a replacement. Regressing the portal builder to
    // fix the tag would have traded one broken editor for another.
    assert.match(editor, /"aqua:portal-block-select"/);
    assert.match(editor, /setSelectedBlockId\(payload\.blockId\)/);
    assert.match(editor, /event\.origin === window\.location\.origin/,
      "the first-party block protocol stays same-origin — it names blocks in somebody's portal");
  });

  it("routes by mode instead of always opening the builder", () => {
    assert.match(editor, /routeTagSelection\(editingModeId, \{ portalTarget \}\)/);
    assert.match(editor, /setTab\(route\.tab as InspectorTab\)/);
  });

  it("completes the handshake before it starts selecting", () => {
    // aquaTagSource.ts pins `explorerParentOrigin` only inside the code that
    // answers a ping or an inspect. Until the editor pings, the tag's replies
    // go out to "*" — so the ping is what stops the page broadcasting the
    // operator's selections, not merely a liveness check.
    assert.match(editor, /aquaTagPing\(requestId\)/);
    assert.match(editor, /onLoad=\{pingTag\}/, "the handshake starts when the frame has a document");
    assert.match(editor, /message\.requestId !== tagPingId\.current/, "only the answer to OUR ping counts");
    assert.match(editor, /tagSelecting \? aquaTagEnable\(\) : aquaTagDisable\(\)/);
  });

  it("never posts to a wildcard origin", () => {
    // `postMessage(payload, "*")` reaches whatever now occupies the frame — and
    // the payload can carry the operator's draft copy.
    assert.match(editor, /const origin = tagOriginRef\.current;\s*\n\s*if \(!target \|\| !origin\) return false;/);
    assert.equal(/postMessage\([^)]*,\s*"\*"\)/.test(editor), false, "no wildcard target origin");
  });

  it("does not fight the operator's typing with the tag's own echo", () => {
    // The tag re-reports the selection after every patch. Adopting that text
    // unconditionally would overwrite the field one round trip behind the
    // keystrokes.
    assert.match(editor, /if \(changed\) \{?\s*setWordsDraft/);
  });
});

describe("the browser is gated on the Aqua Tag, not on what kind of thing this is", () => {
  it("REWRITTEN PIN — the two are still separate, and 'is there a portal' no longer reads projectKind", () => {
    // WAS: `const portalTarget = projectKind !== "software"`.
    //
    // Rewritten rather than deleted, because the thing this test is about —
    // that "is there a portal document" and "is there a browser" are two
    // questions with two answers — is unchanged and still worth pinning. What
    // changed is where the FIRST one gets its answer. `DevProject.kind`'s own
    // doc says the field no longer drives the editor; this line was the last
    // place that still let it, and it was wrong in the direction nobody
    // checked: a legacy project saved as "website" or "portal" made
    // portalTarget TRUE, so the editor fetched whichever client's portal
    // design sorted first and pointed the navigator and the SEO panel at it.
    // Evidence instead: a dev project is open (a repo, an address, a tag) or
    // it is not (the Portal Studio door, which is nothing but a document).
    assert.equal(/const portalTarget = projectKind !== "software"/.test(editor), false,
      "portalTarget must not be derived from the kind field again");
    assert.match(editor, /const portalTarget = !projectId;/,
      "portalTarget stays — it still owns the portal-only machinery — but it is answered by evidence");
    assert.match(editor, /const browserAvailable = portalTarget \|\| tagMapped/);
    assert.match(editor, /const browserPane = showBrowser && browserAvailable/);
  });

  it("takes the answer from the server's ONE rule", () => {
    // devProjectMapStatus().browserAvailable IS devProjectVisualEditorUnlocked.
    assert.match(studioRoute, /devProjectMapStatus\(project\)\.browserAvailable/);
    assert.match(editor, /projectTagStatus\?\.browserAvailable \?\? selectedProject\.aquaTagId/);
  });

  it("says WHY there is no browser, and points at the thing that does work", () => {
    assert.match(editor, /No Aqua Tag on this project, so there is no browser/);
    assert.match(editor, /reads the repository files directly/);
    assert.match(editor, /Open Dev/, "the way forward, not just the refusal");
  });

  it("disables the browser toggle rather than hiding it", () => {
    // A missing control is a mystery; a disabled one with a reason is
    // information.
    assert.match(editor, /disabled=\{!browserAvailable\}/);
  });

  it("opens the browser by default wherever one is possible", () => {
    assert.match(editor, /useState\(projectKind !== "software" \|\| projectTagged\)/);
    // …and points it at the address the tag actually ANSWERS on — see the
    // redirect suite below for why that is not the same address.
    assert.match(editor, /useState\(projectBrowserUrl\)/);
    assert.match(studioRoute, /projectBrowserUrl=\{aquaTagBrowserUrl\(project\)\}/);
  });
});

// ── D1 — a redirecting site used to kill the whole bridge ────────────────────
//
// Reproduced end to end: `project.siteUrl = "https://edsgame.com/"` maps fine,
// `devProjectMapStatus` reports tagVerified, and the setup card even reads
// "Aqua Tag answering at https://www.edsgame.com/". But the editor seeded its
// browser — and therefore its ONE trusted origin — from `siteUrl`, while the
// frame followed the redirect and landed on `https://www.edsgame.com`. Exact
// comparison then rejected everything: the handshake reply was untrusted, no
// click ever arrived, and the panel blamed the tag. bare-domain → www is the
// common case, so this made the feature look broken on most real sites.
describe("a site that redirects still reaches its own tag", () => {
  const project = {
    siteUrl: "https://edsgame.com/",
    map: { tag: { finalUrl: "https://www.edsgame.com/" } },
  };
  const frameWindow = { name: "the preview frame" };

  it("seeds the browser from the MAPPED address, which MAP already computed", () => {
    assert.equal(aquaTagBrowserUrl(project), "https://www.edsgame.com/");
    // The value was there all along — `safeSiteFetch` follows up to five
    // redirects and `mapProject` records the result. It simply was not used.
    assert.notEqual(aquaTagBrowserUrl(project), project.siteUrl);
  });

  it("accepts the selection the OLD seeding rejected", () => {
    const data = selectedMessage();
    const wasBroken = { allowedOrigin: aquaTagOrigin(project.siteUrl), frameWindow };
    const nowFixed = { allowedOrigin: aquaTagOrigin(aquaTagBrowserUrl(project)), frameWindow };
    // Where the frame actually is.
    const event = { origin: "https://www.edsgame.com", source: frameWindow, data };

    assert.equal(acceptAquaTagMessage(event, wasBroken), null, "this is the defect, kept here so it cannot return");
    const message = acceptAquaTagMessage(event, nowFixed);
    assert.ok(message, "the tag's own page must be trusted");
    assert.equal(
      message.type === AQUA_TAG_MESSAGES.selected && message.element?.text,
      "Stunning pools, built properly",
    );
  });

  it("keeps ONE origin and an exact comparison — the policy was not widened", () => {
    const policy = { allowedOrigin: aquaTagOrigin(aquaTagBrowserUrl(project)), frameWindow };
    const data = selectedMessage();
    // The apex is no longer where the frame is, so it is no longer trusted.
    // Accepting both would be the easy fix and the wrong one.
    assert.equal(acceptAquaTagMessage({ origin: "https://edsgame.com", source: frameWindow, data }, policy), null);
    assert.equal(acceptAquaTagMessage({ origin: "https://www.edsgame.com.evil.net", source: frameWindow, data }, policy), null);
    assert.equal(acceptAquaTagMessage({ origin: "http://www.edsgame.com", source: frameWindow, data }, policy), null);
  });

  it("switches projects onto the mapped address too", () => {
    // The picker blanks and re-seeds the box. Re-seeding it from `siteUrl`
    // would reintroduce the bug the moment somebody changed project.
    assert.match(editor, /setBrowserUrl\(aquaTagBrowserUrl\(project\)\)/);
    assert.equal(/setBrowserUrl\(project\?\.siteUrl/.test(editor), false);
    // And the client-side project record has to carry the map for that to work.
    assert.match(editor, /map\?: \{ tag\?: \{ finalUrl\?: string \} \| null \} \| null;/);
  });
});

// ── D2 — the portal builder ran a handshake it could never win ───────────────
describe("the portal preview is not asked to be a tagged page", () => {
  /** The whole `<PreviewFrame … />` element containing `marker`. */
  function previewFrame(marker: string): string {
    const at = editor.indexOf(marker);
    assert.notEqual(at, -1, `${marker} is no longer in DevEditor.tsx`);
    const open = editor.lastIndexOf("<PreviewFrame", at);
    const close = editor.indexOf("/>", at);
    assert.ok(open > 0 && close > at);
    return editor.slice(open, close + 2);
  }

  it("does not ping a page that structurally cannot answer", () => {
    // `/aqua-tag.js` is injected by `src/app/(website)/layout.tsx` and by
    // nothing else — never on `/client-preview`. So the ping went unanswered,
    // the bridge flipped to "unavailable" after 2s on every load, refresh and
    // section change, and the Element tab told the operator to install a tag
    // on a page that must never carry one.
    assert.equal(/onLoad/.test(previewFrame("url={frameUrl}")), false,
      "the Aqua-hosted portal preview must not run the tag handshake");
    // …while the real browser pane still does, which is the whole feature.
    assert.match(previewFrame("url={browserUrl.trim()}"), /onLoad=\{pingTag\}/);
    assert.equal(editor.match(/onLoad=\{pingTag\}/g)?.length, 1, "exactly one frame starts the handshake");
  });

  it("gates the Element tab on the TAG, not on 'a browser exists'", () => {
    // `browserAvailable` is `portalTarget || tagMapped`, so it is true on every
    // portal — and the Element panel is filled by the tag and by nothing else.
    // REWRITTEN 2026-08-22 (phase 9): the call gained a third argument. The
    // SURFACE (Website vs Normal) is a second axis alongside the depth, and it
    // owns exactly one tab ("seo"). The Element tab's gate is unchanged and is
    // still what this test is about — the pin is widened, never weakened.
    assert.match(editor, /inspectorTabsFor\(editingModeId, \{ portalTarget, tagMapped, surface \}\)/);
    assert.equal(/if \(item\.id === "element"\) return browserAvailable/.test(editor), false);
  });

  it("shows no Element tab on the portals door, at any depth", () => {
    // `/portal/agency/portals/editor` passes no project, so nothing is mapped —
    // and there is nothing to press Map on either.
    for (const mode of ALL_MODES) {
      // `surface` added 2026-08-22 (phase 9). "normal" is the universal one and
      // is what every one of these cases was implicitly asserting before the
      // axis existed — the Element tab's gate is the tag, on either surface.
      const tabs = inspectorTabsFor(mode, { portalTarget: true, tagMapped: false, surface: "normal" });
      assert.equal(tabs.includes("element"), false, `${mode} offered an Element tab with no tag`);
      assert.equal(
        inspectorTabsFor(mode, { portalTarget: true, tagMapped: false, surface: "website" }).includes("element"),
        false,
        `${mode} offered an Element tab with no tag on the Website surface either`,
      );
    }
    // A tagged portal is a different matter: then a click really can resolve.
    assert.equal(inspectorTabsFor("visual", { portalTarget: true, tagMapped: true, surface: "normal" }).includes("element"), true);
  });

  it("stops the mobile strip growing a tenth column", () => {
    // The strip sizes itself `repeat(N, 1fr)`, so a tab that can never be
    // filled narrows every real one.
    assert.match(editor, /gridTemplateColumns: `repeat\(\$\{allowedTabs\.length\}, 1fr\) 44px`/);
    const onThePortalDoor = inspectorTabsFor("developer", { portalTarget: true, tagMapped: false, surface: "normal" });
    // 10/11 since 2026-08-22: the Librarian joined the developer ladder — a
    // REAL tab with a mounted panel on every target, so it belongs in the count.
    // 13/14 since phase 14 (2026-08-22 evening): Drafts, History and Notes —
    // the work lifecycle — joined Dev the same way, each with a mounted panel
    // on every target, so all three belong in the count too.
    assert.equal(onThePortalDoor.length, 13);
    assert.equal(inspectorTabsFor("developer", { portalTarget: true, tagMapped: true, surface: "normal" }).length, 14);
    // REWRITTEN 2026-08-22 (phase 9): the Website SURFACE adds exactly one more
    // column — the per-page SEO panel — and it is counted here rather than left
    // out, because the whole point of this test is that the strip cannot grow
    // a column nobody noticed.
    assert.equal(inspectorTabsFor("developer", { portalTarget: true, tagMapped: false, surface: "website" }).length, 14);
    assert.equal(inspectorTabsFor("developer", { portalTarget: true, tagMapped: true, surface: "website" }).length, 15);
  });

  it("keeps Settings reachable and every tab a real one, whatever is connected", () => {
    for (const mode of ALL_MODES) {
      for (const portalTarget of [true, false]) {
        for (const tagMapped of [true, false]) {
        for (const surface of ["normal", "website"] as const) {
          const tabs = inspectorTabsFor(mode, { portalTarget, tagMapped, surface });
          assert.ok(tabs.includes("settings"), `${mode} lost the way to point the editor elsewhere`);
          for (const tab of tabs) {
            assert.ok(INSPECTOR_TABS.includes(tab), `${tab} is not a real tab`);
            // REWRITTEN 2026-08-22 (phase 9): "every offered tab is on this
            // mode's ladder" was the whole rule until the surface axis existed.
            // A SURFACE-owned tab is deliberately on no ladder at all — that is
            // what makes the two axes orthogonal — so it is exempted BY NAME
            // here rather than by loosening the rule for everything.
            if (tab !== "settings" && !SURFACE_TABS.has(tab)) {
              assert.ok(editingMode(mode).tabs.includes(tab), `${mode} offered ${tab}, which it does not have`);
            }
          }
          // The order is the rail's order, always.
          assert.deepEqual(tabs, INSPECTOR_TABS.filter(id => tabs.includes(id)));
        }
        }
      }
    }
  });

  it("never routes a selection to a tab the target has taken away", () => {
    // The pairing that matters: a selection only ever arrives when a tag is
    // mapped, and every destination must exist in that situation.
    for (const mode of ALL_MODES) {
      for (const portalTarget of [true, false]) {
        const route = routeTagSelection(mode, { portalTarget });
        for (const surface of ["normal", "website"] as const) {
          const tabs = inspectorTabsFor(mode, { portalTarget, tagMapped: true, surface });
          assert.ok(tabs.includes(route.tab), `${mode} (portalTarget=${portalTarget}, ${surface}) routes to a missing "${route.tab}"`);
        }
      }
    }
  });
});

// ── D3 — the handshake threw before it started ───────────────────────────────
describe("the handshake survives a non-secure context", () => {
  it("uses the id helper this codebase already has", () => {
    // `crypto.randomUUID` is secure-context-only, so it is undefined on a dev
    // build served over plain http to anything but localhost. It was the FIRST
    // statement of pingTag — which D2 had just made the portal preview's
    // onLoad — so it threw out of an iframe load handler before
    // `setTagBridge("checking")` ever ran. The bridge stayed "idle" and the
    // error was uncaught.
    // Prose stripped first — the comment explaining WHY randomUUID is wrong
    // must not read as the editor still calling it.
    const editorCode = editor
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    assert.equal(/crypto\.randomUUID/.test(editorCode), false, "randomUUID cannot be relied on outside a secure context");
    assert.match(editorCode, /const requestId = makeId\("aquaping"\)/);
    assert.match(editorCode, /from "@\/engines\/editor\/elements\/ids"/);
    // Reused, not reinvented: no third id generator was added for this. The
    // codebase already had `makeId`, which is why the grep came first.
    assert.equal(/Math\.random\s*\(/.test(editorCode), false, "no hand-rolled id generator in the editor");
  });

  it("still produces a usable, distinct request id with no crypto at all", () => {
    // The handshake matches the reply against `tagPingId.current`, so the id
    // must be present and must differ per ping — but it is a correlation token,
    // not a secret, so degrading to Math.random is the right failure.
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    try {
      Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true, writable: true });
      const ids = new Set(Array.from({ length: 200 }, () => makeId("aquaping")));
      assert.equal(ids.size, 200, "ids collided with no crypto available");
      for (const id of ids) assert.match(id, /^aquaping_[0-9a-z]{12}$/);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
      else delete (globalThis as { crypto?: unknown }).crypto;
    }
  });

  it("sets the bridge state before anything that can fail", () => {
    // Ordering is the actual fix's other half: whatever goes wrong, the panel
    // must not be left sitting at "idle" with an uncaught error behind it.
    const ping = editor.slice(editor.indexOf("function pingTag()"));
    const id = ping.indexOf("makeId(");
    const checking = ping.indexOf('setTagBridge("checking")');
    const idle = ping.indexOf('setTagBridge("idle")');
    assert.ok(id > 0 && checking > 0 && idle > 0);
    assert.ok(id < idle && idle < checking, "the id must be taken first, and it must not be able to throw");
  });
});

describe("the right menu Ed asked for", () => {
  it("offers an element tab at every hands-on depth, still led by the assistant", () => {
    // "simple" left this list when it merged into Visual (2026-08-22).
    for (const mode of ["visual", "developer"] as const) {
      assert.ok(editingMode(mode).tabs.includes("element"), `${mode} needs somewhere for the words to land`);
    }
    // Pinned elsewhere too, and worth re-stating: adding a tab must not move it.
    for (const mode of EDITING_MODES) {
      assert.equal(mode.tabs[0], "assistant", `${mode.id} should still lead with the assistant`);
    }
  });

  it("shows the exact text in an editable field", () => {
    assert.match(editor, /function TagElementInspector/);
    assert.match(editor, /<span>The words<\/span>/);
    assert.match(editor, /onChange=\{event => onWordsChange\(event\.target\.value\)\}/);
  });

  it("makes the edit actually change the thing", () => {
    assert.match(editor, /aquaTagPatchMessage\(tagElement\.id, \{ text: next \}\)/);
  });

  it("is reachable without a portal document", () => {
    // A selection on a tagged page is precisely the case with no portal
    // document, so the element branch must sit ABOVE the portal guard.
    const elementBranch = editor.indexOf('if (tab === "element")');
    const portalGuard = editor.indexOf("These tools apply to an Aqua-hosted portal");
    assert.ok(elementBranch > 0 && portalGuard > 0);
    assert.ok(elementBranch < portalGuard,
      "the element panel must be returned before the 'this is not a portal' guard");
  });

  it("does not pretend a preview edit has been saved", () => {
    // The words change the loaded page and are gone on reload. Saying so is the
    // difference between a preview and an hour of a client's copy lost.
    assert.match(editor, /lost when the page reloads/);
  });

  it("hands the same selection to the assistant, quoted rather than summarised", () => {
    assert.match(assistant, /words\?: \{/);
    assert.match(assistant, /Its exact text is/);
    assert.match(editor, /words: tagPanel\.element \?/);
  });
});
