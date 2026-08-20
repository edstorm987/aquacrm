import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RESOLUTION_FOCUSES, isResolutionFocus } from "../src/lib/inbox/resolutionContext";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const sources = walk(join(ROOT, "src"));

describe("resolution focus targets are declared, not invented", () => {
  it("every data-resolution-focus in the app uses a known focus value", () => {
    // A typo'd value produces a ring that never appears, or worse, silently
    // points nowhere while the operator waits to be told where to look.
    const bad: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, "utf-8");
      for (const match of text.matchAll(/data-resolution-focus="([^"]+)"/g)) {
        // Skip the selector built by ResolutionSpotlight itself — an
        // interpolated value is a lookup, not a declaration.
        if (match[1].includes("${")) continue;
        if (!isResolutionFocus(match[1])) bad.push(`${file.replace(ROOT, "")}: "${match[1]}"`);
      }
    }
    assert.deepEqual(bad, [], `unknown focus values:\n${bad.join("\n")}`);
  });

  it("every focus the alert layer emits has a screen to land on", async () => {
    // Guards against the whole mechanism silently going unused after a
    // refactor — the banner would still show, so nobody would notice.
    const annotated = new Set<string>();
    for (const file of sources) {
      for (const match of readFileSync(file, "utf-8").matchAll(/data-resolution-focus="([^"]+)"/g)) {
        if (!match[1].includes("${")) annotated.add(match[1]);
      }
    }
    // Every focus the alert layer can emit must have somewhere to land.
    // Otherwise an operator is told "highlighted below" and nothing is.
    const { RESOLUTION_FOCUSES: all } = await import("../src/lib/inbox/resolutionContext");
    const unlanded = all.filter(focus => !annotated.has(focus));
    assert.deepEqual(unlanded, [],
      `these focuses have no annotated screen, so the banner would promise a highlight that never appears: ${unlanded.join(", ")}`);
  });

  it("the spotlight styles exist for the class it applies", () => {
    const css = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf-8");
    assert.match(css, /\.aqua-resolution-target\s*\{/, "the ring class must be defined");
    assert.match(css, /prefers-reduced-motion/, "the pulse must respect reduced motion");
  });

  it("exposes a stable set of focus values", () => {
    assert.ok(RESOLUTION_FOCUSES.length >= 8);
    assert.equal(new Set(RESOLUTION_FOCUSES).size, RESOLUTION_FOCUSES.length, "no duplicates");
  });
});
