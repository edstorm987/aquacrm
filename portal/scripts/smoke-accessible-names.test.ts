import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

// Accessible names for the controls that carry no visible text.
//
// An icon-only button announces as "button" with nothing else. A field whose
// only hint is a placeholder announces as "edit text, blank" the moment a value
// is typed into it, and a section that points `aria-labelledby` at an id that is
// never rendered announces with no name at all. This guard scans the workspaces
// and published blocks that carried those defects and fails on a regression, so
// the fixes cannot be quietly undone.

function read(path: string): string {
  return readFileSync(path, "utf8");
}

// The workspaces whose icon-only controls this guard owns.
const ICON_BUTTON_FILES = [
  "src/app/portal/team/_TeamWorkspace.tsx",
  "src/app/portal/agency/people/_PeopleCommand.tsx",
  "src/app/portal/agency/automations/_AutomationsWorkspace.tsx",
  "src/app/portal/agency/company/_CompanyWorkspace.tsx",
  "src/app/portal/agency/company/_LegalCompliancePanel.tsx",
  "src/app/portal/agency/sop-library/_SopLibrary.tsx",
  "src/app/portal/agency/actions/_ActionsWorkspace.tsx",
  "src/app/portal/agency/_CommandIntelligenceWorkspace.tsx",
];

// The published website blocks whose visitor-facing fields this guard owns.
const PUBLISHED_BLOCK_FILES = [
  "src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx",
  "src/built-ins/modules/website-editor/src/components/blocks/BookingWidgetBlock.tsx",
  "src/built-ins/modules/website-editor/src/components/blocks/NewsletterSignupBlock.tsx",
  "src/built-ins/modules/website-editor/src/components/blocks/ProductSearchBlock.tsx",
  "src/built-ins/modules/website-editor/src/components/blocks/DonationButtonBlock.tsx",
];

type ParsedButton = { attributes: string; children: string; line: number };

const isWordCharacter = (character: string | undefined): boolean =>
  character !== undefined && /[A-Za-z0-9_]/.test(character);

/**
 * Reads one opening tag starting at `index`, tracking quotes and JSX expression
 * braces so that attribute values containing `>` (arrow functions, comparisons)
 * do not truncate it. `<input … onChange={e => …} placeholder="…" />` must come
 * back whole, or a scan over its attributes silently sees half a tag.
 */
function readOpeningTag(source: string, index: number, tagLength: number): { attributes: string; end: number; selfClosing: boolean } {
  let cursor = index + tagLength;
  let depth = 0;
  let quote = "";
  for (; cursor < source.length; cursor++) {
    const character = source[cursor];
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") { quote = character; continue; }
    if (character === "{") depth++;
    else if (character === "}") depth--;
    else if (character === ">" && depth === 0) break;
  }
  const selfClosing = source[cursor - 1] === "/";
  return { attributes: source.slice(index + tagLength, selfClosing ? cursor - 1 : cursor), end: cursor, selfClosing };
}

/** Walks the source for `<button …>…</button>` elements and their children. */
function parseButtons(source: string): ParsedButton[] {
  const buttons: ParsedButton[] = [];
  for (let index = 0; index < source.length; index++) {
    if (!source.startsWith("<button", index) || isWordCharacter(source[index + 7])) continue;
    const { attributes, end: cursor, selfClosing } = readOpeningTag(source, index, 7);
    const line = source.slice(0, index).split("\n").length;
    if (selfClosing) { buttons.push({ attributes, children: "", line }); continue; }
    let end = cursor + 1;
    let nesting = 0;
    while (end < source.length) {
      if (source.startsWith("</button>", end)) {
        if (nesting === 0) break;
        nesting--;
        end += 9;
        continue;
      }
      if (source.startsWith("<button", end) && !isWordCharacter(source[end + 7])) { nesting++; end += 7; continue; }
      end++;
    }
    buttons.push({ attributes, children: source.slice(cursor + 1, end), line });
  }
  return buttons;
}

// Children that are nothing but self-closing components — `<X size={16} />`,
// `<Plus size={15} aria-hidden />` — leave the button with no text at all.
const ICON_ONLY_CHILDREN = /^\s*(?:<[A-Z][A-Za-z0-9]*(?:\s[^<>]*?)?\/>\s*)+$/;
// A bare typographic glyph is just as nameless: `×` announces as "times" or is
// skipped outright, and it is the exact shape three remove controls shipped in.
// The scanner has to recognise it, or it cannot hold the fix it was written for.
const GLYPH_ONLY_CHILDREN = /^\s*[^\sA-Za-z0-9<>{}]{1,2}\s*$/;
const CARRIES_A_NAME = /\b(?:aria-label|aria-labelledby|title)=/;

const carriesNoText = (children: string): boolean =>
  ICON_ONLY_CHILDREN.test(children) || GLYPH_ONLY_CHILDREN.test(children);

function unnamedIconButtons(path: string): string[] {
  const source = read(path);
  return parseButtons(source)
    .filter(button => carriesNoText(button.children) && !CARRIES_A_NAME.test(button.attributes))
    .map(button => `${path}:${button.line} ${button.children.trim()}`);
}

describe("accessible names", () => {
  it("detects an icon-only button that has lost its name", () => {
    // The guard has to have teeth: these are the exact shapes that shipped
    // unnamed, and the scanner must still catch them.
    const regressed = [
      `const a = <button disabled={busy === "new"} className="rounded"><Plus size={16} /></button>;`,
      `const b = <button onClick={() => request("PATCH", { id: task.id, status: task.status === "done" ? "todo" : "done" })} className="x"><Check size={15} /></button>;`,
      `const c = <button onClick={onClose} className="grid size-9"><X size={16} /></button>;`,
      `const d = <button onClick={() => removeBlock(block.id)} className="border-red-200 text-red-600">×</button>;`,
    ].join("\n");
    const found = parseButtons(regressed).filter(
      button => carriesNoText(button.children) && !CARRIES_A_NAME.test(button.attributes),
    );
    assert.equal(found.length, 4, "the scanner no longer recognises an unnamed icon-only button");
    // A button with visible text is not a finding.
    const labelled = parseButtons(`<button onClick={save}><Save size={15} /> Save SOP</button>`);
    assert.equal(labelled.filter(button => carriesNoText(button.children)).length, 0);
    // Neither is a short but real word, or a glyph that leads visible text.
    const texts = parseButtons(`<button>OK</button><button><X size={12} /> Clear</button><button>+ Question</button>`);
    assert.equal(texts.filter(button => carriesNoText(button.children)).length, 0);
  });

  it("leaves no icon-only button unnamed in the workspaces this guard owns", () => {
    const findings = ICON_BUTTON_FILES.flatMap(unnamedIconButtons);
    assert.deepEqual(findings, [], `icon-only buttons announce as "button" with no name:\n${findings.join("\n")}`);
  });

  it("names the Team task, note and onboarding toggles after the thing they act on", () => {
    const team = read("src/app/portal/team/_TeamWorkspace.tsx");
    assert.match(team, /aria-label="Add task"/, "the add-task control lost its name");
    assert.match(team, /aria-label="New work note"/, "the new-note control lost its name");
    assert.match(
      team,
      /aria-label=\{task\.status === "done" \? `Mark "\$\{task\.title\}" not done` : `Mark "\$\{task\.title\}" done`\}/,
      "the task completion toggle no longer names the task it completes",
    );
    assert.match(
      team,
      /aria-label=\{item\.status === "done" \? `Mark onboarding step "\$\{item\.label\}" not done`/,
      "the onboarding toggle no longer names the step it completes",
    );
    assert.match(team, /aria-pressed=\{task\.status === "done"\}/, "the task toggle lost its pressed state");
    assert.match(team, /aria-pressed=\{item\.status === "done"\}/, "the onboarding toggle lost its pressed state");
    // The three fields in this file that sit outside a `<label>` — the rest are
    // wrapped in one with visible text, which already names them.
    assert.match(team, /aria-label="Note body"/, "the work-note body is placeholder-only again");
    assert.match(team, /aria-label="Your message to the founder"/, "the founder message box is placeholder-only again");
    assert.match(team, /aria-label="Type your full name to sign"/, "the contract signature field is placeholder-only again");
  });

  it("names the People onboarding template reorder and remove controls after their step", () => {
    const people = read("src/app/portal/agency/people/_PeopleCommand.tsx");
    assert.match(people, /const stepName = step\.label\.trim\(\) \|\| `step \$\{index \+ 1\}`/,
      "the step controls lost the label that gives them row context");
    assert.match(people, /aria-label=\{`Onboarding step \$\{index \+ 1\} label`\}/, "the step input is placeholder-only again");
    assert.match(people, /aria-label=\{`Who owns \$\{stepName\}`\}/, "the owner select lost its name");
    assert.match(people, /aria-label=\{`Move \$\{stepName\} earlier`\}/, "the move-up control lost its name");
    assert.match(people, /aria-label=\{`Move \$\{stepName\} later`\}/, "the move-down control lost its name");
    assert.match(people, /aria-label=\{`Remove \$\{stepName\}`\}/, "the remove control lost its name");
    assert.doesNotMatch(people, /className="inline-flex size-8 items-center justify-center rounded-md border border-red-200 text-red-600">×</,
      "the remove control is a bare × glyph again");
    // The training-module editor in the same file carried the same bare glyph on
    // its content-block and quiz-question removes. They are named too, so the
    // sweep is the whole file rather than one editor inside it.
    assert.match(people, /aria-label=\{`Remove this \$\{block\.type\} block`\}/, "the content-block remove is an unnamed × again");
    assert.match(people, /aria-label=\{`Remove question "\$\{question\.prompt\.trim\(\) \|\| "untitled"\}"`\}/, "the quiz-question remove is an unnamed × again");
    assert.doesNotMatch(people, />×</, "a bare × glyph is standing in for an accessible name again");
  });

  it("gives an automation run a keyboard path and names the run-detail close", () => {
    const automations = read("src/app/portal/agency/automations/_AutomationsWorkspace.tsx");
    // The row stays clickable for the mouse, but the last cell now carries a
    // real button so the keyboard can reach the same run.
    assert.match(
      automations,
      /<button type="button" onClick=\{event => \{ event\.stopPropagation\(\); setSelectedId\(run\.id\); \}\} aria-label=\{`Inspect the \$\{flowName\} run started \$\{formatDate\(run\.createdAt\)\}`\}/,
      "the run history row is mouse-only again — there is no focusable control naming the run",
    );
    assert.match(automations, /<MoreHorizontal size=\{15\} aria-hidden \/>/,
      "the run-history glyph is announced as content instead of being hidden");
    assert.match(automations, /aria-label="Close run detail"/, "the run-detail close lost its name");
  });

  it("names every modal header close button after the dialog it closes", () => {
    const company = read("src/app/portal/agency/company/_CompanyWorkspace.tsx");
    const legal = read("src/app/portal/agency/company/_LegalCompliancePanel.tsx");
    const sops = read("src/app/portal/agency/sop-library/_SopLibrary.tsx");
    const actions = read("src/app/portal/agency/actions/_ActionsWorkspace.tsx");
    for (const [name, source] of [["Company", company], ["Legal", legal], ["SOP library", sops]] as const) {
      assert.match(source, /aria-label=\{`Close \$\{title\}`\}/, `the ${name} modal close is an unnamed X again`);
    }
    assert.match(actions, /aria-label="Close the calendar editor"/, "the calendar editor close lost its name");
    assert.match(actions, /aria-label="Close calendars and accounts"/, "the calendar sources close lost its name");
  });

  it("renders every heading id that a Command Intelligence section points at", () => {
    const intelligence = read("src/app/portal/agency/_CommandIntelligenceWorkspace.tsx");
    const referenced = [...intelligence.matchAll(/aria-labelledby="([a-z0-9-]+)"/g)].map(match => match[1]);
    assert.ok(referenced.length >= 8, "the intelligence sections stopped naming themselves");
    const rendered = new Set([
      ...[...intelligence.matchAll(/\bid="([a-z0-9-]+)"/g)].map(match => match[1]),
      // SectionHeading renders whatever `titleId` it is handed.
      ...[...intelligence.matchAll(/titleId="([a-z0-9-]+)"/g)].map(match => match[1]),
    ]);
    const dangling = referenced.filter(id => !rendered.has(id));
    assert.deepEqual(dangling, [], `aria-labelledby points at ids nothing renders: ${dangling.join(", ")}`);
    assert.match(intelligence, /<h3 id=\{titleId\}/, "SectionHeading stopped rendering the id its section references");
  });

  it("never lets a placeholder stand in as the accessible name on a published form field", () => {
    // The tag has to be read whole. A plain non-greedy regex stops at the `>` of
    // the `onChange={e => …}` arrow, so on three of these five blocks it would
    // never reach the `placeholder` that follows and would pass on an unnamed
    // field — which is why this walks the tag rather than matching it.
    const findings: string[] = [];
    for (const path of PUBLISHED_BLOCK_FILES) {
      const source = read(path);
      for (const tag of ["<input", "<textarea"]) {
        for (let index = 0; index < source.length; index++) {
          if (!source.startsWith(tag, index) || isWordCharacter(source[index + tag.length])) continue;
          const { attributes } = readOpeningTag(source, index, tag.length);
          if (!/\bplaceholder=/.test(attributes)) continue;
          if (/\baria-label(?:ledby)?=/.test(attributes)) continue;
          findings.push(`${path}:${source.slice(0, index).split("\n").length} ${tag}>`);
        }
      }
    }
    assert.deepEqual(findings.sort(), [], `a placeholder is a hint, not a name:\n${findings.join("\n")}`);
  });

  it("reads a whole field tag, so an arrow function cannot hide an unnamed placeholder", () => {
    // The self-test for the field scanner: this is the exact shape the newsletter,
    // product-search and donation inputs are written in.
    const shaped = `<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />`;
    const { attributes } = readOpeningTag(shaped, 0, 6);
    assert.match(attributes, /placeholder="you@example\.com"/, "the field scanner truncates at the arrow function again");
    assert.doesNotMatch(attributes, /\baria-label=/);
  });

  it("keeps the product search named when the site owner clears its placeholder", () => {
    // `placeholder` is a free-text inspector field, so `?? "Search products…"`
    // does not cover it: cleared to "" it would have emitted `aria-label=""`,
    // which is no name at all — exactly the case the hint can be switched off in.
    const search = read("src/built-ins/modules/website-editor/src/components/blocks/ProductSearchBlock.tsx");
    assert.match(search, /const searchName = placeholder\.trim\(\) \|\| "Search products"/,
      "an emptied placeholder makes the product search input nameless again");
    assert.match(search, /aria-label=\{searchName\}/, "the product search name is back to the raw placeholder");
  });

  it("announces published form errors and confirmations rather than only showing them", () => {
    const contact = read("src/built-ins/modules/website-editor/src/components/blocks/ContactFormBlock.tsx");
    const booking = read("src/built-ins/modules/website-editor/src/components/blocks/BookingWidgetBlock.tsx");
    const newsletter = read("src/built-ins/modules/website-editor/src/components/blocks/NewsletterSignupBlock.tsx");
    const search = read("src/built-ins/modules/website-editor/src/components/blocks/ProductSearchBlock.tsx");
    assert.match(contact, /\{error && <p role="alert"/, "the contact form error is silent to a screen reader");
    assert.match(contact, /<div role="status"/, "the contact form confirmation is silent to a screen reader");
    assert.match(booking, /\{error && <p role="alert"/, "the booking error is silent to a screen reader");
    assert.match(newsletter, /\{error && <p role="alert"/, "the newsletter error is silent to a screen reader");
    assert.match(newsletter, /<p role="status"/, "the newsletter confirmation is silent to a screen reader");
    assert.match(search, /<p role="status"/, "the empty product search result is silent to a screen reader");
  });
});
