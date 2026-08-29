// The bar that says you are not looking at live data.
//
// Ed asked for it to sit above the whole application and push it down, rather
// than float. The reason that matters is not decoration: the controls used to
// be a pill at `bottom-4`, and a floating badge is a thing you stop seeing
// after a day. Sandbox mode is precisely the state where "I forgot" is
// expensive — you either mistake demo numbers for real ones, or you make a
// change believing it saved.
//
// ── The invariant that is easy to break later ────────────────────────────
//
// Eight shells fill the viewport exactly (`h-dvh`) and scroll internally.
// Putting a bar above one of those pushes its bottom edge off-screen. They now
// measure `--aqua-shell-h`, which `globals.css` defaults to `100dvh` and the
// bar redefines while it is mounted.
//
// The failure mode is silent and delayed: someone adds a NEW full-height shell
// with `h-dvh`, it looks perfect in normal use, and it is broken only for
// people in sandbox mode — who are the ones least likely to report a layout
// bug, because they assume the sandbox is odd. So the sweep below fails on any
// bare `h-dvh` in a shell, not just on the eight known ones.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const BAR = "src/components/chrome/SandboxTopBar.tsx";
const LAYOUT = "src/app/portal/layout.tsx";
const CSS = "src/app/globals.css";

/**
 * Blank out comments while KEEPING line numbers, so the report still points at
 * a real line. The first version skipped lines starting `//` or `*`, and was
 * immediately caught out by this file's own JSX comment mentioning `h-dvh` —
 * a detector that flags the documentation explaining the rule.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, match => match.replace(/[^\n]/g, " "))
    .replace(/\/\*[\s\S]*?\*\//g, match => match.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, match => " ".repeat(match.length));
}

function tsxUnder(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...tsxUnder(path));
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("the sandbox bar", () => {
  it("is mounted, and only for a sandbox session", () => {
    const layout = readFileSync(LAYOUT, "utf8");
    assert.match(layout, /session\.sandbox \? <SandboxTopBar/,
      "the bar must render for a sandbox session");
    assert.doesNotMatch(layout, /bottom-4[\s\S]{0,120}SandboxModeSwitcher/,
      "the floating sandbox pill must be gone — it is what the bar replaces");
  });

  it("Dev Mode keeps its floating switcher — it answers a different question", () => {
    // Dev Mode hops personas on LIVE data. It is not a warning about which
    // dataset you are on, so it must not inherit the bar and imply one.
    const layout = readFileSync(LAYOUT, "utf8");
    assert.match(layout, /bottom-4[\s\S]{0,160}DevModeSwitcher/,
      "the Dev Mode switcher must keep the floating treatment");
  });

  it("takes real space rather than floating over the app", () => {
    // Comments stripped first. Twice in one session a source-grep test has
    // flagged the PROSE explaining the rule — here the phrase "kept the height
    // fixed", describing the very bug this assertion exists to prevent.
    const bar = withoutComments(readFileSync(BAR, "utf8"));
    assert.doesNotMatch(bar, /\bfixed\b|\babsolute\b|\bsticky\b/,
      "the bar must be in normal flow so it PUSHES the application down; a floating bar "
      + "overlaps content and is the thing this replaced");
    assert.match(bar, /w-full/, "and span the full width");
  });

  it("keeps a fixed height, so what the shells subtract is always right", () => {
    assert.match(readFileSync(CSS, "utf8"), /--aqua-sandbox-bar-h:\s*[\d.]+rem/,
      "the height must be a declared constant, not implied by content");
  });

  it("never lets Exit fall off the edge", () => {
    // Caught in the browser at 800px: the first version kept the height fixed by
    // scrolling the bar sideways, which pushed Exit — the way OUT of sandbox
    // mode — off the right edge, reachable only by discovering the bar scrolled.
    const bar = withoutComments(readFileSync(BAR, "utf8"));
    assert.doesNotMatch(bar, /overflow-x-auto/,
      "the bar must not scroll; scrolling hides whichever control is last, and that is Exit");
    assert.match(bar, /mm-sandbox-topbar-detail[^"]*truncate/,
      "the SENTENCE is the only part that can shrink without losing a function, so it truncates");
    assert.match(bar, /<div className="flex shrink-0 items-center">\s*<SandboxModeSwitcher/,
      "the controls must never shrink");
    assert.match(readFileSync(CSS, "utf8"),
      /max-width:\s*639px\)\s*\{\s*\.mm-dev-mode-switcher-bar \.mm-dev-mode-switcher-personas \{ display: none/,
      "below sm the persona switcher drops away — a convenience — and Exit stays");
  });

  it("sets the shell height in the first paint, not after hydration", () => {
    const bar = readFileSync(BAR, "utf8");
    assert.match(bar, /<style>\{`:root\{--aqua-shell-h:calc\(100dvh - var\(--aqua-sandbox-bar-h\)\)/,
      "a useEffect would leave every shell one bar too tall until hydration");
  });

  it("does not duplicate the switching logic", () => {
    // One component, two presentations. Two copies of "become this persona"
    // is how the bar and the pill end up disagreeing about what Exit means.
    const bar = readFileSync(BAR, "utf8");
    assert.match(bar, /<SandboxModeSwitcher[\s\S]{0,120}variant="bar"/);
    const switcher = readFileSync("src/components/chrome/SandboxModeSwitcher.tsx", "utf8");
    assert.match(switcher, /variant\?: "pill" \| "bar"/, "the presentation must be a prop, not a fork");
    assert.match(switcher, /requestSandboxMode/, "and the logic must still live in one place");
  });

  it("tells the truth about a snapshot", () => {
    // A snapshot is a COPY of real records. "Nothing here is real" over the top
    // of one is a comfortable lie: the actions are discarded, the names and
    // numbers on screen are somebody's actual data, and that changes who may
    // look at your screen.
    const bar = readFileSync(BAR, "utf8");
    assert.match(bar, /the records are real, your changes are not kept/,
      "a snapshot must not be described as fake data");
  });
});

describe("every full-height shell measures the variable", () => {
  const SHELL_DIRS = ["src/app/portal", "src/components/chrome"];

  it("no shell still hard-codes h-dvh", () => {
    const offenders: string[] = [];
    for (const dir of SHELL_DIRS) {
      for (const file of tsxUnder(dir)) {
        const text = withoutComments(readFileSync(file, "utf8"));
        for (const [index, line] of text.split("\n").entries()) {
          // `min-h-dvh` grows, so a bar above it is harmless. `max-h-` and
          // `calc(100dvh - …)` are popovers sizing themselves, not shells.
          if (!/(?<![\w-])h-dvh(?![\w-])/.test(line)) continue;
          if (/min-h-dvh|max-h-|calc\(/.test(line)) continue;
          offenders.push(`${file}:${index + 1}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "These fill the viewport with a hard-coded `h-dvh`. With the sandbox bar mounted their bottom "
      + "edge is pushed off-screen, and it is broken ONLY for people in sandbox mode — who assume the "
      + "sandbox is meant to look odd and do not report it. Use `h-[var(--aqua-shell-h,100dvh)]`:\n  "
      + offenders.join("\n  "),
    );
  });

  it("the comment stripper has not blinded the detector", () => {
    // If `withoutComments` were too greedy it would erase real markup and the
    // sweep above would pass over an empty file, proving nothing.
    const shell = withoutComments(readFileSync("src/app/portal/agency/layout.tsx", "utf8"));
    assert.match(shell, /mm-portal-root/, "real class names must survive the strip");
    assert.match(shell, /var\(--aqua-shell-h,100dvh\)/, "…including the height the shells opted into");
    assert.doesNotMatch(withoutComments("const a = 1; // h-dvh"), /h-dvh/, "…and comments must not");
  });

  it("the eight known shells opted in", () => {
    const opted = SHELL_DIRS
      .flatMap(dir => tsxUnder(dir))
      .filter(file => readFileSync(file, "utf8").includes("var(--aqua-shell-h,100dvh)"));
    assert.ok(opted.length >= 7, `expected the full-height shells to name the variable, found ${opted.length}`);
  });

  it("globals declares the default, so a shell works with no bar at all", () => {
    assert.match(readFileSync(CSS, "utf8"), /--aqua-shell-h:\s*100dvh/,
      "without this default the shells collapse whenever the bar is absent — which is almost always");
  });
});
