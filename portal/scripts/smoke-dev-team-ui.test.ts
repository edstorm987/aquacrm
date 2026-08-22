import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const DEV_TEAM_DIR = "src/app/portal/dev-team";
const TRANSITION = "src/components/chrome/DevTeamTransition.tsx";
const LAYOUT = "src/app/portal/dev-team/layout.tsx";

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsx(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

// The core shipyard contract: every meaning-carrying token exists so the whole
// workspace can be recoloured from one place, and the theme flip is real.
const REQUIRED_TOKENS = [
  "--dev-bg",
  "--dev-surface",
  "--dev-surface-raised",
  "--dev-ink",
  "--dev-ink-muted",
  "--dev-line",
  "--dev-accent",
  "--dev-accent-hover",
  "--dev-accent-soft",
  "--dev-success",
  "--dev-danger",
  "--dev-warning",
  "--dev-info",
  "--dev-glow",
];

test("the dev-team tsx no longer carries any raw hex — every colour is a token", () => {
  const offenders: string[] = [];
  for (const file of walkTsx(DEV_TEAM_DIR)) {
    let src = read(file);
    // The layout hosts the shipyard token definitions + cutscene CSS in a server
    // <style> (relocated from globals.css, which Tailwind v4/Turbopack silently
    // dropped). That block is the ONE legitimate home of raw hex — strip it first.
    if (file === LAYOUT) src = src.replace(/<style>\{`[\s\S]*?`\}<\/style>/g, "");
    const hits = src.match(/#[0-9a-fA-F]{6}\b/g);
    if (hits) offenders.push(`${file}: ${[...new Set(hits)].join(", ")}`);
  }
  assert.equal(offenders.length, 0, `raw hex must be tokenised:\n${offenders.join("\n")}`);
});

test("the shipyard token block defines every key token in BOTH light and dark", () => {
  const css = read(LAYOUT);

  // Light (timber mill) block and dark (forge) override, both scoped to the shell.
  const lightIdx = css.indexOf(".mm-dev-team-shell {");
  const darkIdx = css.indexOf('html[data-color-mode="dark"] .mm-dev-team-shell {');
  assert.ok(lightIdx !== -1, "the light .mm-dev-team-shell token block must exist");
  assert.ok(darkIdx !== -1, "the dark .mm-dev-team-shell override must exist");
  assert.ok(darkIdx > lightIdx, "dark override comes after the light base");

  const lightBlock = css.slice(lightIdx, css.indexOf("}", lightIdx));
  const darkBlock = css.slice(darkIdx, css.indexOf("}", darkIdx));

  for (const token of REQUIRED_TOKENS) {
    assert.match(lightBlock, new RegExp(`${token}\\s*:`), `light block must define ${token}`);
    assert.match(darkBlock, new RegExp(`${token}\\s*:`), `dark block must define ${token}`);
  }

  // The palette actually flips: mill values light, forge values dark.
  assert.match(lightBlock, /--dev-bg:\s*#efe3cd/, "light bg = planed pine");
  assert.match(lightBlock, /--dev-accent:\s*#1c7167/, "light accent = boat-paint teal");
  assert.match(darkBlock, /--dev-bg:\s*#15110d/, "dark bg = wrought iron");
  assert.match(darkBlock, /--dev-accent:\s*#ff7a2f/, "dark accent = hot-iron ember");

  // The muted body tone is darkened past #7c6a52 (which fails WCAG AA on pine).
  assert.doesNotMatch(lightBlock, /--dev-ink-muted:\s*#7c6a52/, "muted body tone must be darkened past #7c6a52");

  // ...and neither may --dev-faint, which is the token that ACTUALLY carries
  // Panel titles, Panel hints, PageHeader meta and EmptyState. It sat at
  // #7c6a52 (4.09:1 on --dt-bg) in the mill and #8a765f (3.78:1 on --dt-raised)
  // in the forge; both missed AA at the 12px the size normaliser forces.
  assert.doesNotMatch(lightBlock, /--dev-faint:\s*#7c6a52/, "mill --dev-faint must clear AA on planed pine");
  assert.doesNotMatch(darkBlock, /--dev-faint:\s*#8a765f/, "forge --dev-faint must clear AA on the raised forge surface");

  // The INVERTED WELL stays dark in BOTH modes. --dev-ink is a TEXT token and
  // flips to cream in the forge, so anything that fills with it and writes light
  // text on top vanishes (white on #f3e7d6 is 1.22:1). This pair exists so the
  // master-tag snippet and the remove-attachment dot never inherit that flip.
  for (const token of ["--dev-inverse", "--dev-inverse-ink", "--dev-inverse-muted"]) {
    assert.match(lightBlock, new RegExp(`${token}\\s*:`), `light block must define ${token}`);
    assert.match(darkBlock, new RegExp(`${token}\\s*:`), `dark block must define ${token}`);
  }
});

test("no dev-team surface fills itself with a TEXT token", () => {
  // --dev-ink / --dt-ink invert with the colour mode. Used as a background they
  // take whatever foreground was written for the light mill and destroy it in
  // the forge. --dev-inverse is the token for a deliberately dark panel.
  const offenders: string[] = [];
  for (const file of walkTsx(DEV_TEAM_DIR)) {
    if (file === LAYOUT) continue;
    for (const [i, line] of read(file).split("\n").entries()) {
      if (/bg-\[color:var\(--(dev|dt)-ink\)\]/.test(line)) offenders.push(`${file}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, [], "fill with --dev-inverse, not with the ink token");
});

test("filled tone chips carry --dev-on-accent, never a hardcoded white", () => {
  // White reads on the mill's deep tones and drowns on the forge's embers:
  // #ffffff on --dev-accent is 5.8:1 light but 2.6:1 dark, and its hover makes
  // that WORSE (2.2:1). --dev-on-accent already flips with the mode.
  const offenders: string[] = [];
  for (const file of walkTsx(DEV_TEAM_DIR)) {
    for (const [i, line] of read(file).split("\n").entries()) {
      if (!/text-white\b/.test(line)) continue;
      if (/bg-\[color:var\(--dev-(accent|success|danger|warning|info)\)\]/.test(line)) offenders.push(`${file}:${i + 1}`);
    }
  }
  assert.deepEqual(offenders, [], "use text-[color:var(--dev-on-accent)] on a filled tone");
});

test("the historical --dt-* names remain as aliases so existing markup keeps resolving", () => {
  const css = read(LAYOUT);
  const lightIdx = css.indexOf(".mm-dev-team-shell {");
  const lightBlock = css.slice(lightIdx, css.indexOf("}", lightIdx));
  for (const alias of ["--dt-bg", "--dt-surface", "--dt-ink", "--dt-muted", "--dt-line", "--dt-hairline", "--dt-hover"]) {
    assert.match(lightBlock, new RegExp(`${alias}:\\s*var\\(--dev-`), `${alias} must alias a --dev-* token`);
  }
});

test("DevTeamTransition mirrors the cinematic gate + reduced-motion handling", () => {
  const src = read(TRANSITION);
  // Same cinematic-mode machinery as CommandCenterTransition.
  assert.match(src, /from "@\/lib\/chrome\/cinematicMode"/);
  assert.match(src, /cinematicModeEnabled\(\)/);
  assert.match(src, /CINEMATIC_MODE_EVENT/);
  assert.match(src, /CINEMATIC_MODE_STORAGE_KEY/);
  // Refuses to play when cinematic mode is off.
  assert.match(src, /if \(!cinematicModeEnabled\(\)\)/);
  // Respects reduced motion.
  assert.match(src, /prefers-reduced-motion/);
  assert.match(src, /reducedMotionPreferred/);
  // Engage → release phase machinery, like the bridge handshake.
  assert.match(src, /phase: "release"/);
  assert.match(src, /dataset\.devTeamTransition/);
});

test("the cutscene is wired into the Dev Team layout, gated by cinematic mode", () => {
  const layout = read(LAYOUT);
  assert.match(layout, /import \{ DevTeamTransition \} from "@\/components\/chrome\/DevTeamTransition"/);
  assert.match(layout, /<DevTeamTransition \/>/);

  // Belt-and-braces: cinematic OFF hides the overlay via CSS too.
  const css = read(LAYOUT);
  assert.match(css, /html\[data-cinematic-mode="false"\] \.mm-dev-transition\s*\{\s*display:\s*none/);
});
