// Smoke — R031 Accessibility audit.

import {
  auditAccessibility,
  contrastRatio,
  classifyContrast,
} from "../lib/a11yAudit";
import type { Block } from "../types/block";

let passes = 0;
let failures = 0;
function expect(label: string, cond: boolean, detail?: string): void {
  if (cond) { passes++; console.log(`  ✓ ${label}`); }
  else      { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

(async () => {
  // ─── A: clean tree → only landmark warnings (info + warning) ─────────
  const cleanTree: Block[] = [
    { id: "s1", type: "section", props: {}, children: [
      { id: "h1", type: "heading", props: { text: "Welcome", level: 1 } },
      { id: "img1", type: "image", props: { src: "/x.jpg", alt: "Hero shot" } },
      { id: "btn1", type: "button", props: { label: "Sign up" } },
    ]},
  ];
  const clean = auditAccessibility(cleanTree);
  expect("clean tree has 0 critical", clean.countsBySeverity.critical === 0);
  expect("clean tree has 0 serious", clean.countsBySeverity.serious === 0);
  expect("clean tree passesBaseline", clean.passesBaseline === true);
  // Nav landmark info-level issue still present (no navbar block in clean tree).
  expect("clean tree info-level nav issue present",
    clean.issues.some(i => i.code === "missing-landmark" && i.severity === "info"));

  // ─── B: image without alt → critical ─────────────────────────────────
  const noAlt: Block[] = [
    { id: "s", type: "section", props: {}, children: [
      { id: "i", type: "image", props: { src: "/x.jpg" } },
    ]},
  ];
  const r1 = auditAccessibility(noAlt);
  const altIssue = r1.issues.find(i => i.code === "img-missing-alt");
  expect("image without alt → img-missing-alt critical",
    altIssue?.severity === "critical");
  expect("img-missing-alt is autofixable",
    altIssue?.autofixable === true);
  expect("passesBaseline=false with critical issue",
    !r1.passesBaseline);
  expect("alt issue path is nested", altIssue?.path === "[0].children[0]");

  // ─── C: icon-only button without label → critical ────────────────────
  const iconBtn: Block[] = [
    { id: "s", type: "section", props: {}, children: [
      { id: "b", type: "button", props: { icon: "star" } },
    ]},
  ];
  const iconAudit = auditAccessibility(iconBtn);
  const iconIssue = iconAudit.issues.find(i => i.code === "icon-button-missing-label");
  expect("icon button without label → critical",
    iconIssue?.severity === "critical");

  // Button without icon AND without label → still flagged but as serious
  // (less obvious to operators, surfaces in audit panel, doesn't break
  // baseline).
  const blankBtn: Block[] = [
    { id: "s", type: "section", props: {}, children: [
      { id: "b", type: "button", props: {} },
    ]},
  ];
  const blankAudit = auditAccessibility(blankBtn);
  const blankIssue = blankAudit.issues.find(i => i.code === "icon-button-missing-label");
  expect("blank button → serious",
    blankIssue?.severity === "serious");

  // ─── D: heading skip-level → warning ─────────────────────────────────
  const skipHeading: Block[] = [
    { id: "h1", type: "heading", props: { text: "Top", level: 1 } },
    { id: "h3", type: "heading", props: { text: "Skipped", level: 3 } },
  ];
  const skip = auditAccessibility(skipHeading);
  expect("h1 → h3 skip flagged as warning",
    skip.issues.some(i => i.code === "heading-skip-level" && i.severity === "warning"));

  // ─── E: empty heading → serious autofix ───────────────────────────────
  const emptyHead: Block[] = [
    { id: "s", type: "section", props: {}, children: [
      { id: "h", type: "heading", props: { level: 2 } },
    ]},
  ];
  const empty = auditAccessibility(emptyHead);
  const emptyIssue = empty.issues.find(i => i.code === "heading-empty");
  expect("empty heading → serious autofix",
    emptyIssue?.severity === "serious" && emptyIssue?.autofixable === true);

  // ─── F: form field without label ─────────────────────────────────────
  const formNoLabel: Block[] = [
    { id: "s", type: "section", props: {}, children: [
      { id: "f", type: "form", props: { fields: [{ name: "email" }, { name: "msg", label: "Message" }] } },
    ]},
  ];
  const formAudit = auditAccessibility(formNoLabel);
  expect("form field without label → serious",
    formAudit.issues.some(i =>
      i.code === "form-input-missing-label" && i.severity === "serious"));
  // Only the unlabeled field should be flagged.
  const formIssues = formAudit.issues.filter(i => i.code === "form-input-missing-label");
  expect("only unlabeled field flagged (1 not 2)",
    formIssues.length === 1);

  // ─── G: video without track → warning ────────────────────────────────
  const noTrack: Block[] = [
    { id: "s", type: "section", props: {}, children: [
      { id: "v", type: "video", props: {} },
    ]},
  ];
  const vAudit = auditAccessibility(noTrack);
  expect("video without track → warning",
    vAudit.issues.some(i => i.code === "video-missing-track" && i.severity === "warning"));

  // ─── H: duplicate id → serious ───────────────────────────────────────
  const dupId: Block[] = [
    { id: "s", type: "section", props: { id: "intro" }, children: [
      { id: "x", type: "heading", props: { id: "intro", text: "Hi", level: 1 } },
    ]},
  ];
  const dupAudit = auditAccessibility(dupId);
  expect("duplicate id → serious",
    dupAudit.issues.some(i => i.code === "duplicate-id" && i.severity === "serious"));

  // ─── I: empty tree → no critical, just the landmark info ─────────────
  const empty0 = auditAccessibility([]);
  expect("empty tree returns 0 issues",
    empty0.total === 0);
  expect("empty tree passesBaseline",
    empty0.passesBaseline);

  // ─── J: countsByCode + countsBySeverity aggregation ──────────────────
  const mixed: Block[] = [
    { id: "s", type: "section", props: {}, children: [
      { id: "i1", type: "image", props: { src: "/a.jpg" } },              // critical alt
      { id: "i2", type: "image", props: { src: "/b.jpg" } },              // critical alt
      { id: "h1", type: "heading", props: { text: "", level: 1 } },       // serious empty heading
    ]},
  ];
  const mixedAudit = auditAccessibility(mixed);
  expect("counts.img-missing-alt = 2",
    mixedAudit.countsByCode["img-missing-alt"] === 2);
  expect("counts.heading-empty = 1",
    mixedAudit.countsByCode["heading-empty"] === 1);
  expect("countsBySeverity.critical = 2",
    mixedAudit.countsBySeverity.critical === 2);
  expect("countsBySeverity.serious = 1",
    mixedAudit.countsBySeverity.serious === 1);
  // Issues sorted: critical before serious.
  expect("issues sorted: critical before serious",
    mixedAudit.issues[0]!.severity === "critical");

  // ─── K: contrastRatio + classifyContrast ─────────────────────────────
  const black = contrastRatio("#000000", "#ffffff");
  expect("black-on-white contrast ≈ 21",
    black !== null && Math.abs(black - 21) < 0.5);
  expect("black-on-white classifies AAA",
    black !== null && classifyContrast(black) === "AAA");

  const lightGray = contrastRatio("#888888", "#ffffff");
  expect("middle gray classifies AA-large or fail",
    lightGray !== null && (classifyContrast(lightGray) === "AA-large" || classifyContrast(lightGray) === "fail"));

  expect("invalid hex → null",
    contrastRatio("garbage", "#fff") === null);

  // 3-char hex form.
  const shortHex = contrastRatio("#000", "#fff");
  expect("3-char hex parsed", shortHex !== null && shortHex > 20);

  // ─── L: nav-info isn't critical (still allows passesBaseline=true) ──
  expect("info-level missing-landmark doesn't break passesBaseline",
    clean.passesBaseline === true);

  console.log(`\n${passes} passed · ${failures} failed`);
  if (failures > 0) process.exit(1);
})();
