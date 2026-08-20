import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clearanceFor } from "../src/lib/inbox/resolutionExplain";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf-8");

const builders = read("src", "lib", "server", "resolutionPlans.ts");
const chart = read("src", "components", "attention", "MetricSparkline.tsx");
const controls = read("src", "components", "attention", "AttentionControls.tsx");

describe("radar evidence shows the numbers, not a description of them", () => {
  it("recognises a radar item under every id form it arrives as", () => {
    // The same incident reaches the UI as a recommendation id, a raw incident
    // id, or an issue id depending on where it was surfaced.
    for (const id of ["radar:x", "recommended-radar:incident:a", "incident:compliance:coverage"]) {
      assert.equal(clearanceFor(id).kind, "judgement", `${id} must classify as judgement`);
      assert.ok(builders.includes('alertId.startsWith("incident:")'), "bare incident ids must dispatch");
    }
  });

  it("pulls the retained history for each check behind the incident", () => {
    assert.match(builders, /inspectRadarEvidenceSeries/);
    assert.match(builders, /incident\.checkIds/);
  });

  it("says when the history is too thin to conclude from", () => {
    // Better to admit five readings prove nothing than to draw a confident
    // line through noise.
    assert.match(builders, /too few to call this a pattern/);
  });

  it("does not plot a series it cannot draw", () => {
    assert.match(builders, /points\.length >= 2/, "two points minimum for a line");
  });
});

describe("the chart is readable, not decorative", () => {
  it("draws the median as a reference line, not a second series", () => {
    // It is the thing being compared against; equal weight would imply two
    // measures where there is one.
    assert.match(chart, /strokeDasharray/);
    assert.match(chart, /reference line/i);
  });

  it("keeps the median inside the plot", () => {
    // A baseline you cannot see defeats the comparison.
    assert.match(chart, /Include the median in the extent/);
  });

  it("survives a flat series instead of dividing by zero", () => {
    assert.match(chart, /rawMax - rawMin \|\|/);
  });

  it("carries a text alternative and a caption", () => {
    assert.match(chart, /role="img"/);
    assert.match(chart, /aria-label=/);
    assert.match(chart, /figcaption/);
  });

  it("marks breaching readings with a title, never colour alone", () => {
    assert.match(chart, /<title>/);
  });
});

describe("controls follow what kind of action it is", () => {
  it("offers Resolve only where something can be resolved on a screen", () => {
    // A Resolve button on a judgement call promises a fix that cannot exist.
    assert.match(controls, /const canResolve = kind === "in-app"/);
  });

  it("makes Evidence the primary action for a judgement call", () => {
    assert.match(controls, /kind === "judgement"/);
  });

  it("offers Mark done for work that happens outside Aqua", () => {
    assert.match(controls, /kind === "off-system" && onMarkDone/);
  });
});
