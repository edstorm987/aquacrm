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
  assert.match(lightBlock, /--dev-accent:\s*#1f7a6e/, "light accent = boat-paint teal");
  assert.match(darkBlock, /--dev-bg:\s*#15110d/, "dark bg = wrought iron");
  assert.match(darkBlock, /--dev-accent:\s*#ff7a2f/, "dark accent = hot-iron ember");

  // The muted body tone is darkened past #7c6a52 (which fails WCAG AA on pine).
  assert.doesNotMatch(lightBlock, /--dev-ink-muted:\s*#7c6a52/, "muted body tone must be darkened past #7c6a52");
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
