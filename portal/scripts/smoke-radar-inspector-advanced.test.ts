// The Data Inspector's "Advanced" gate.
//
// Part of the Command Centre simplification: the inspector opens on the readable
// records, and raw JSON, internal IDs, and the full instrument filter set live
// behind one honest "Advanced" switch. These are static-source contracts (the
// rest of the inspector suite is read the same way) so a regression that removes
// the gate — or quietly puts raw JSON back on the default view — fails here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const workspace = readFileSync("src/app/portal/agency/radar/RadarInspectionWorkspace.tsx", "utf8");

test("Advanced is a remembered, off-by-default switch", () => {
  assert.match(workspace, /const \[advanced, setAdvanced\] = useState\(false\)/, "Advanced defaults off");
  assert.match(workspace, /INSPECTOR_ADVANCED_STORAGE_KEY = "aqua-inspector-advanced"/, "the choice is persisted per browser");
  assert.match(workspace, /window\.localStorage\.setItem\(INSPECTOR_ADVANCED_STORAGE_KEY/, "toggling writes the preference");
  // A visible, accessible switch in the header.
  assert.match(workspace, /data-testid="inspector-advanced-toggle"/);
  assert.match(workspace, /role="switch"[^>]*aria-checked=\{advanced\}/, "the toggle is a labelled switch");
  // The setting reaches the leaf inspectors without prop-threading.
  assert.match(workspace, /InspectorAdvancedContext\.Provider value=\{advanced\}/);
  assert.match(workspace, /const advanced = useInspectorAdvanced\(\)/, "leaf inspectors read the gate");
});

test("a deep link into raw data or an expert filter turns Advanced on", () => {
  assert.match(workspace, /deepLinkNeedsAdvanced = initialTab === "raw"/);
  assert.match(workspace, /!\(SIMPLE_STATUS_OPTIONS as readonly string\[\]\)\.includes\(initialStatus\)/);
  assert.match(workspace, /initialScope !== "all"/);
});

test("raw JSON is only rendered under Advanced", () => {
  // Every raw record dump sits behind the gate.
  assert.match(workspace, /\{advanced \? <InspectorSection title="Raw check record">/);
  assert.match(workspace, /\{advanced \? <InspectorSection title="Raw evidence series">/);
  // The whole Raw data tab is hidden from the nav and refuses to render otherwise.
  assert.match(workspace, /\.filter\(\(\[id\]\) => advanced \|\| id !== "raw"\)/);
  assert.match(workspace, /tab === "raw" \? \(advanced \? <RawInspection/);
  // The source-record and incident-finding dumps too.
  assert.match(workspace, /\{advanced \? <pre[^>]*>\{JSON\.stringify\(record, null, 2\)\}/);
  assert.match(workspace, /\{advanced \? <pre[^>]*>\{JSON\.stringify\(issue, null, 2\)\}/);
});

test("internal identifiers are only shown under Advanced", () => {
  assert.match(workspace, /\{advanced \? <dl className="space-y-2 text-xs"><Identifier label="Check ID"/);
  assert.match(workspace, /\{advanced \? <><Identifier label="Incident ID"/);
});

test("the default status filter is plain; the 12-option instrument set is Advanced-only", () => {
  assert.match(workspace, /SIMPLE_STATUS_OPTIONS = \["all", "attention", "critical", "warning", "watch"\]/);
  // The full instrument set carries the expert states (order-independent).
  const advancedLine = workspace.split("\n").find(line => line.includes("ADVANCED_STATUS_OPTIONS ="));
  assert.ok(advancedLine, "ADVANCED_STATUS_OPTIONS is declared");
  for (const expert of ["applicable", "assured", "firing", "blind", "learning", "inactive"]) {
    assert.ok(advancedLine!.includes(`"${expert}"`), `the advanced status set carries "${expert}"`);
  }
  assert.match(workspace, /statusOptions = mode === "incidents" \|\| !advanced \? SIMPLE_STATUS_OPTIONS : ADVANCED_STATUS_OPTIONS/);
  // Scope and Lens are expert dimensions, hidden until Advanced.
  assert.match(workspace, /const showExpertFilters = showCheckFilters && advanced/);
});
