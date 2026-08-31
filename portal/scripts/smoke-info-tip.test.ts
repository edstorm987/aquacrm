// FIRST: re-execs this file without the suite's `--conditions react-server`,
// which `react-dom/server` refuses to load under. See the note in that file.
import "./client-render-condition";

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { InfoTip } from "../src/components/ui/InfoTip";

// The information icon, and the surfaces that have adopted it.
//
// Ed asked for "information icons everywhere where needed". Several workspaces
// had already answered that with `<span title="…"><Info aria-hidden /></span>`,
// which is an explanation only a mouse user can read: a non-focusable span
// carries no keyboard route, no touch route, and no reliable screen-reader
// announcement. This guard pins the accessible replacement so the shared
// component cannot regress into that shape, and pins the surfaces that now
// translate their own jargon so a new statistic cannot ship untranslated.

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("the information icon explains itself to keyboard, touch and screen readers", () => {
  const markup = renderToStaticMarkup(createElement(InfoTip, {
    label: "Blind",
    children: "KPIs with no data source at all.",
  }));

  // A real button, not a span: focusable, activatable by Enter and Space, and
  // reachable by touch. This is the whole point of the component.
  assert.match(markup, /<button[^>]*type="button"/, "the trigger must be a real button");
  assert.match(markup, /aria-label="What Blind means"/, "an icon-only button announces as \"button\" without a name");
  assert.match(markup, /aria-expanded="false"/, "a disclosure must say whether it is open");

  // `aria-controls` has to point at an element that is actually rendered —
  // pointing at an id that never exists announces with no relationship at all.
  const controls = /aria-controls="([^"]+)"/.exec(markup);
  assert.ok(controls, "the button must name the panel it controls");
  assert.ok(markup.includes(`id="${controls[1]}"`), "aria-controls must point at a rendered element");

  // The explanation is real DOM text, so it can be read at the reader's own
  // pace — not a `title` tooltip that vanishes and is never announced.
  assert.match(markup, /role="note"/);
  assert.match(markup, /KPIs with no data source at all\./, "the explanation must be in the document");
  assert.doesNotMatch(markup, /title=/, "a title attribute is not an accessible explanation");
  assert.match(markup, /hidden=""/, "the panel starts closed");

  // The icon itself must not be announced: the button already has a name, and
  // an unhidden decorative glyph doubles it up.
  assert.match(markup, /<svg[^>]*aria-hidden="true"/);
});

test("the information icon carries its own contrast onto the near-black surfaces", () => {
  // Command Centre and Dev Team are cyan-on-near-black. A light-only tooltip
  // there is white text on white — present in the DOM and unreadable on screen.
  const dark = renderToStaticMarkup(createElement(InfoTip, {
    label: "Portfolio ROAS", tone: "dark", children: "Attributed revenue divided by recorded spend.",
  }));
  assert.match(dark, /bg-\[#03131c\]/, "the dark panel must paint its own background");
  assert.doesNotMatch(dark, /bg-white\b/);

  const light = renderToStaticMarkup(createElement(InfoTip, {
    label: "Blocked", children: "Milestones that cannot move.",
  }));
  assert.match(light, /bg-white\b/);
});

test("the panel cannot push the page sideways", async () => {
  // These icons sit in grid cells that start near the right-hand edge. A fixed
  // 16rem panel anchored there widens the document, and horizontal overflow is
  // a browser-acceptance failure rather than a cosmetic one.
  const markup = renderToStaticMarkup(createElement(InfoTip, { label: "Blind", children: "…" }));
  assert.match(markup, /max-w-\[min\(16rem,calc\(100vw-2rem\)\)\]/, "the panel must never be wider than the viewport");

  const source = await read("../src/components/ui/InfoTip.tsx");
  assert.match(source, /getBoundingClientRect\(\)/, "an opened panel must be measured against the viewport");
  assert.match(source, /window\.innerWidth/);
});

test("Command Intelligence translates every readout it prints", async () => {
  const source = await read("../src/app/portal/agency/_CommandIntelligenceWorkspace.tsx");
  assert.match(source, /import \{ InfoTip \} from "@\/components\/ui\/InfoTip"/);

  // Every label the workspace actually renders must have a plain-English
  // reading. "Blind" and "Learning" are instrument shorthand; a statistic that
  // reaches an operator untranslated is one they cannot act on.
  const meanings = new Set(
    [...source.matchAll(/^\s{2}"([^"]+)":\s"/gm)].map(match => match[1]),
  );
  const printed = [...source.matchAll(/<SummaryReadout label="([^"]+)"/g)].map(match => match[1]);
  assert.ok(printed.length >= 15, `expected the workspace's readouts, found ${printed.length}`);
  for (const label of printed) {
    assert.ok(meanings.has(label), `"${label}" is printed with no plain-English meaning behind it`);
  }
  for (const jargon of ["Blind", "Learning", "Portfolio ROAS", "Unmapped labels"]) {
    assert.ok(meanings.has(jargon), `"${jargon}" is the exact wording an operator cannot decode`);
  }

  // The readout renders the icon from that map rather than a hover-only title.
  assert.match(source, /READOUT_MEANINGS\[label\]/);
  assert.match(source, /<InfoTip label=\{label\} tone="dark"/);
});

test("a Fulfilment metric cannot ship without saying what it counts", async () => {
  const source = await read("../src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx");
  assert.match(source, /import \{ InfoTip \} from "@\/components\/ui\/InfoTip"/);

  // `hint` is required in the type, so this is belt and braces: it also proves
  // every metric on screen today actually passes one.
  assert.match(source, /function Metric\(\{[^}]*\bhint\b[^}]*\}: \{[^}]*hint: string;/);
  const metrics = [...source.matchAll(/<Metric\s[^>]*?\/>/g)].map(match => match[0]);
  assert.equal(metrics.length, 5, "the overview prints five metrics");
  for (const metric of metrics) {
    const label = /label="([^"]+)"/.exec(metric)?.[1] ?? metric;
    const hint = /hint="([^"]+)"/.exec(metric)?.[1];
    assert.ok(hint, `"${label}" has no plain-English hint`);
    assert.ok(hint.length > 40, `"${label}" repeats its caption instead of explaining itself`);
  }

  // An explanation that is WRONG is worse than none: the operator now believes
  // a filter that does not exist. Two of these are counted from the record and
  // must not be described as anything stronger than the record proves.
  //
  //   • "Active clients" is `clients.length`, and `fulfilment/page.tsx` builds
  //     that list as `status === "active" && stage !== "churned"` — there is no
  //     "delivery has started" filter, so a client with nothing assigned counts.
  //   • "Portals ready" is `portalBuiltAt` being a number (page.tsx:218). BUILT
  //     is not SENT: `operationalAlerts.ts` tracks `portalAccessSentAt`
  //     separately and raises a signal for the built-but-never-sent case. An
  //     explanation saying the portal is "shared with them" claims a handover
  //     the system has not performed.
  const hintFor = (label: string) =>
    /hint="([^"]+)"/.exec(metrics.find(metric => metric.includes(`label="${label}"`)) ?? "")?.[1] ?? "";
  assert.match(hintFor("Active clients"), /still counted here|not the work/,
    "Active clients counts active, non-churned records — it must not claim work has started");
  assert.doesNotMatch(hintFor("Portals ready"), /shared with them|sent to them/,
    "portalReady means the portal was BUILT; sending the access details is a separate, tracked step");
  assert.match(hintFor("Portals ready"), /built/i);
});

test("the inbox says what Resolve, Remind later and Dismiss actually do", async () => {
  const source = await read("../src/app/portal/agency/inbox/_MasterInbox.tsx");
  assert.match(source, /import \{ InfoTip \} from "@\/components\/ui\/InfoTip"/);
  assert.match(source, /function SectionHeader\(\{ title, detail, hint \}/);

  const header = /<SectionHeader title="What needs you now"[\s\S]*?\/>/.exec(source);
  assert.ok(header, "the attention section must still exist");
  const hint = /hint="([^"]+)"/.exec(header[0])?.[1];
  assert.ok(hint, "the attention section carries no explanation of its three controls");
  // Dismiss is the one operators read as "delete". Saying so is the honesty
  // contract: never claim an outcome the system does not perform.
  for (const word of ["Resolve", "Remind me later", "Dismiss"]) {
    assert.ok(hint.includes(word), `the explanation never mentions ${word}`);
  }
  assert.match(hint, /comes back|until the evidence/, "Dismiss must not read as deletion");

  // Resolve has TWO paths (`AlertRow`): with a matched conversation it calls
  // `openAttentionContact`, which focuses that thread and does NOT clear the
  // signal; without one it dismisses and navigates to `alert.href`. An
  // explanation that states the clearing branch as if it were the only one
  // claims an outcome the system does not always perform.
  assert.match(hint, /conversation/,
    "Resolve opens the matched conversation without clearing the signal — the explanation must say so");
});

test("the explanation sits beside the inbox heading, not inside it", async () => {
  // A button nested in an <h2> is part of that heading's accessible name, so
  // the heading list reads "What needs you now What What needs you now means".
  const source = await read("../src/app/portal/agency/inbox/_MasterInbox.tsx");
  // `SectionHeader` is written on one line, so take that line — not a brace
  // scan, which runs past the end of a single-line function and lands on some
  // other component's `<h2>`, where this guard would pass without looking at
  // the heading it is about.
  const header = source.split("\n").find(line => line.includes("function SectionHeader("));
  assert.ok(header, "SectionHeader must still exist on one line");
  const heading = /<h2[^>]*>(.*?)<\/h2>/.exec(header)?.[1];
  assert.ok(heading, "SectionHeader must still render an h2");
  assert.doesNotMatch(heading, /InfoTip/, "the icon must not be inside the heading it explains");
  assert.match(header, /<InfoTip label=\{title\}/, "…but it must still be rendered beside it");
});

test("the adopted surfaces do not keep a mouse-only tooltip beside the icon", async () => {
  // The pattern this component replaces: a bare span whose only explanation is
  // a `title`, wrapped around a decorative icon. Reachable by hover and by
  // nothing else.
  const sources = await Promise.all([
    read("../src/app/portal/agency/_CommandIntelligenceWorkspace.tsx"),
    read("../src/app/portal/agency/fulfilment/_FulfilmentWorkspace.tsx"),
    read("../src/app/portal/agency/inbox/_MasterInbox.tsx"),
    read("../src/components/ui/InfoTip.tsx"),
  ]);
  for (const source of sources) {
    // Block comments are stripped first: `InfoTip.tsx` quotes the pattern in
    // its own header to say what it replaces, and that quotation is the
    // documentation, not a regression.
    assert.doesNotMatch(
      source.replace(/\/\*[\s\S]*?\*\//g, ""),
      /<span[^>]*\btitle="[^"]*"[^>]*>\s*<Info\b/,
      "an explanation on a non-focusable span is mouse-only",
    );
  }
});
