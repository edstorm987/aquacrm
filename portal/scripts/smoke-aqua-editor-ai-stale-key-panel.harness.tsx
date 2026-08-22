// AQUA EDITOR AI — the stale key-panel harness.
//
// Renders `AquaEditorAIKey` to REAL HTML in two states and prints them as one
// JSON document on stdout:
//
//   • `stale` — the panel is scoped to project B while the `status` in hand
//     still carries project A's answer. That is exactly the one-round-trip
//     window after an in-editor project switch, and the defect this pins was
//     project B wearing A's masked key tail, vault label, model and brief
//     while the panel simultaneously said "Reading this project's setup…".
//   • `fresh` — the SAME status rendered for its own project, proving that
//     every fact the test bans genuinely renders when it should. An assertion
//     that could never fail proves nothing.
//
// A separate process because the smoke suite runs under
// `NODE_OPTIONS='--conditions react-server'`, where `react-dom/server` does
// not resolve at all — the same reason `smoke-portal-element-parity.harness.tsx`
// exists. Run directly to see the JSON:
//   npx tsx scripts/smoke-aqua-editor-ai-stale-key-panel.harness.tsx

import React from "react";

// react-dom/server has no shipped types under this tsconfig's module
// resolution, and is deliberately not reachable under `--conditions
// react-server`; see the header.
// @ts-expect-error — no d.ts in scope
import * as ReactDomServer from "react-dom/server";

import { AquaEditorAIKey } from "../src/components/editing/AquaEditorAIKey";
import type { EditorAiStatus } from "../src/server/types";

const renderToStaticMarkup =
  (ReactDomServer as { renderToStaticMarkup: (node: unknown) => string }).renderToStaticMarkup;

// Project A's answer, every credential fact populated with an unmistakable
// value so the test can grep the rendered HTML for each one.
const PROJECT_A_STATUS: EditorAiStatus = {
  projectId: "devproj_a",
  configured: true,
  model: "gpt-model-of-project-a",
  instructions: "briefed-only-for-project-a",
  tokenHint: "••••a4f2",
  connectionLabel: "Aqua Editor AI — Project A",
  updatedAt: 1,
};

function render(projectId: string): string {
  return renderToStaticMarkup(
    <AquaEditorAIKey
      projectId={projectId}
      projectName={projectId === "devproj_a" ? "Project A" : "Project B"}
      status={PROJECT_A_STATUS}
      reason="reason-sentence-about-project-a"
      vaultAvailable
      onChanged={() => {}}
    />,
  );
}

process.stdout.write(JSON.stringify({
  stale: render("devproj_b"),
  fresh: render("devproj_a"),
}));
