// `aria-modal="true"` is a promise about the keyboard. (todo.md; issues #135.)
//
// Declaring a dialog modal tells assistive technology that everything behind it
// is inert — the reader stops announcing the page, and the person is told they
// are "in a dialog". If the code does not then hold focus inside that dialog,
// the promise is a lie in the worst direction: Tab walks the caret out into
// content the reader has been told is not there, and there is no visible cursor
// to show where it went. Escape is the other half of the same bargain: a dialog
// you can be locked into and cannot leave with the keyboard is a trap, not a
// modal.
//
// On 2026-08-30 the app declared 54 files' worth of `aria-modal="true"` and
// only three of them trapped focus. The remedy was NOT a second modal
// implementation — `src/lib/a11y/useFocusTrap.ts` already existed and
// `ConfirmDialog` already demonstrated the full contract. The hook grew the two
// options the rest of the app was hand-rolling or missing (`onEscape`,
// `initialFocus`), and every modal dialog adopted it.
//
// This file pins both halves, so the next modal cannot quietly regress:
//   • the trap's own rule, as a pure function with no DOM in it;
//   • a repo-wide sweep — every file that DECLARES a modal dialog uses the one
//     shared hook, once per dialog, on the dialog element itself, with a way
//     out by keyboard.
//
// What it deliberately does NOT claim: that a real browser was tabbed through
// these dialogs. That acceptance walk is still open (issues #137) — a source
// sweep can prove the wiring exists, never that it feels right under a screen
// reader.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { wrapFocusIndex } from "../src/lib/a11y/useFocusTrap.ts";

const SRC = "src";
// Retired code kept for reference only; it ships to nobody.
const IGNORED = ["src/archive"];

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (IGNORED.some(skip => path.startsWith(skip))) continue;
    if (statSync(path).isDirectory()) sources(path, out);
    else if (path.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const FILES = sources(SRC).map(path => ({ path, text: readFileSync(path, "utf8") }));
const MODAL_FILES = FILES.filter(file => file.text.includes('aria-modal="true"'));

/** The opening tag that carries an attribute, for checking its siblings. */
function openingTagAt(text: string, attributeIndex: number): string {
  let cursor = attributeIndex;
  while (cursor > 0) {
    cursor = text.lastIndexOf("<", cursor);
    if (cursor < 0) break;
    if (/[A-Za-z]/.test(text[cursor + 1] ?? "")) break;
    // Step past this "<" before searching again — searching from the same index
    // finds it a second time and spins forever (a `<` inside an earlier
    // attribute expression, say, or a closing tag).
    cursor -= 1;
  }
  return cursor < 0 ? "" : text.slice(cursor, attributeIndex);
}

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe("the focus trap's rule", () => {
  // The DOM half of the hook is three lines around this function, so this is
  // where the behaviour lives and where it can be read.

  it("wraps forward off the last stop, and back off the first", () => {
    assert.equal(wrapFocusIndex(4, 3, false), 0, "Tab on the last control returns to the first");
    assert.equal(wrapFocusIndex(4, 0, true), 3, "Shift+Tab on the first control returns to the last");
  });

  it("leaves the browser alone in the middle of the dialog", () => {
    // Trapping must not mean re-implementing Tab: inside the dialog the native
    // order is the right order, including for controls the selector never saw.
    assert.equal(wrapFocusIndex(4, 1, false), null);
    assert.equal(wrapFocusIndex(4, 2, true), null);
  });

  it("pulls focus back in from outside, in BOTH directions", () => {
    // The bug this replaced: focus outside the dialog bounced back only on
    // Shift+Tab, so tabbing forward off the dialog's own container escaped into
    // the page the modal had just declared inert.
    assert.equal(wrapFocusIndex(3, -1, false), 0);
    assert.equal(wrapFocusIndex(3, -1, true), 2);
  });

  it("has nowhere to send focus in an empty dialog", () => {
    // The caller still swallows the key — an empty dialog keeps the caret
    // rather than handing it to the page behind.
    assert.equal(wrapFocusIndex(0, -1, false), null);
  });
});

describe("the shared hook carries the whole contract", () => {
  const hook = readFileSync("src/lib/a11y/useFocusTrap.ts", "utf8");

  it("offers Escape and a deliberate initial focus, so dialogs stop hand-rolling them", () => {
    assert.match(hook, /export interface FocusTrapOptions/);
    assert.match(hook, /onEscape\?: \(\) => void/);
    assert.match(hook, /initialFocus\?: RefObject<HTMLElement \| null>/);
    assert.match(hook, /options: FocusTrapOptions = \{\}/);
  });

  it("puts focus in the dialog without stealing it from a child that already has it", () => {
    // Several dialogs rely on `autoFocus` for their first field. React applies
    // that before effects run, so the hook must not overwrite it.
    assert.match(hook, /container\.contains\(document\.activeElement\)/);
    assert.match(hook, /initialFocus\?\.current/);
  });

  it("returns focus to whatever opened the dialog", () => {
    assert.match(hook, /const previouslyFocused = document\.activeElement/);
    assert.match(hook, /previouslyFocused\.focus\(\)/);
  });

  it("reads the caller's latest handlers without re-running the effect", () => {
    // An inline `{ onEscape: () => ... }` changes identity every render. If it
    // were an effect dependency, the cleanup would restore focus mid-dialog and
    // fight the user for the caret.
    assert.match(hook, /const optionsRef = useRef\(options\)/);
    assert.match(hook, /\}, \[active, ref\]\);/);
  });

  it("gives a stacked dialog the keyboard, so one Escape does not collapse the stack", () => {
    // ConfirmDialog opens over editors that are themselves trapped. Without an
    // ordering both would answer the same Escape and the person would lose the
    // editor they were only confirming a step inside.
    assert.match(hook, /const openTraps: object\[\] = \[\]/);
    assert.match(hook, /openTraps\.push\(token\)/);
    assert.match(hook, /const isTopmost = \(\) => openTraps\[openTraps\.length - 1\] === token/);
    assert.equal((hook.match(/if \(!isTopmost\(\)\) return;/g) ?? []).length, 2, "Tab and Escape both defer to the top dialog");
    assert.match(hook, /openTraps\.splice\(index, 1\)/, "a closed dialog leaves the stack");
  });

  it("closes on Escape only for dialogs that asked to be dismissable", () => {
    // Escape is opt-in: a dialog holding unsaved work may want a confirm step,
    // and several callers pass `busy ? undefined : close` for exactly that.
    assert.match(hook, /const onEscape = optionsRef\.current\.onEscape;\n\s+if \(!onEscape\) return;/);
  });
});

describe("every modal dialog in the app keeps the contract", () => {
  it("has modal dialogs to check at all", () => {
    // Guards the sweep itself: a broken glob that matched nothing would
    // otherwise pass every assertion below in silence.
    assert.ok(MODAL_FILES.length >= 50, `expected the app's modal dialogs, found ${MODAL_FILES.length} files`);
  });

  it("uses the one shared hook — never a second focus-trap implementation", () => {
    const untrapped = MODAL_FILES
      .filter(file => !file.text.includes("useFocusTrap"))
      .map(file => file.path);
    assert.deepEqual(untrapped, [], "these declare aria-modal=\"true\" but trap nothing");
  });

  it("traps each dialog it declares, not just the first", () => {
    // Files carrying three dialogs used to trap one and leave two open.
    const short = MODAL_FILES
      .filter(file => occurrences(file.text, "useFocusTrap(") < occurrences(file.text, 'aria-modal="true"'))
      .map(file => file.path);
    assert.deepEqual(short, [], "fewer focus traps than modal dialogs");
  });

  it("attaches the trap to the dialog element itself", () => {
    // A hook with no `ref` on the `role="dialog"` node traps nothing while
    // looking, to every name-matching sweep, exactly like one that does.
    const detached: string[] = [];
    for (const file of MODAL_FILES) {
      let cursor = 0;
      while (true) {
        const found = file.text.indexOf('aria-modal="true"', cursor);
        if (found < 0) break;
        cursor = found + 1;
        if (!openingTagAt(file.text, found).includes("ref={")) {
          detached.push(`${file.path}:${file.text.slice(0, found).split("\n").length}`);
        }
      }
    }
    assert.deepEqual(detached, [], "modal dialog elements with no ref for the trap");
  });

  it("leaves a keyboard way out of every dialog", () => {
    // The trap without a release is the accessibility failure it was meant to
    // fix. Either the hook's own `onEscape`, or the component's own handler.
    const noExit = MODAL_FILES
      .filter(file => occurrences(file.text, "onEscape:") + occurrences(file.text, '=== "Escape"')
        < occurrences(file.text, 'aria-modal="true"'))
      .map(file => file.path);
    assert.deepEqual(noExit, [], "modal dialogs with no Escape route");
  });

  it("calls the hook unconditionally, above every early return", () => {
    // `useFocusTrap` is a hook, so a component that returns early before
    // reaching it renders a DIFFERENT number of hooks once the early return
    // stops firing — React then throws "Rendered more hooks than during the
    // previous render" and the whole client component dies. This is invisible
    // to `tsc` and to a name-matching sweep: `_PhaseTransitionButton` shipped it
    // once, below `if (!phases ...) return null;` with `phases` arriving from a
    // fetch, so the crash landed the moment the data came back.
    const conditional: string[] = [];
    for (const file of FILES.filter(entry => entry.text.includes("useFocusTrap("))) {
      const lines = file.text.split("\n");
      lines.forEach((line, index) => {
        if (!/^\s+useFocusTrap\(/.test(line)) return;
        const indent = line.length - line.trimStart().length;
        // Walk back to the line that opens the enclosing component.
        let start = 0;
        for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
          const candidate = lines[cursor];
          if (candidate.trim() === "") continue;
          const candidateIndent = candidate.length - candidate.trimStart().length;
          if (candidateIndent === indent - 2 && /\{\s*$/.test(candidate)) { start = cursor; break; }
          if (candidateIndent === 0) { start = cursor; break; }
        }
        for (let cursor = start + 1; cursor < index; cursor += 1) {
          const body = lines[cursor];
          const bodyIndent = body.length - body.trimStart().length;
          if (bodyIndent !== indent) continue;
          if (/(^|\s)return\b/.test(body)) {
            conditional.push(`${file.path}:${cursor + 1} returns before the trap on line ${index + 1}`);
          }
        }
      });
    }
    assert.deepEqual(conditional, [], "useFocusTrap called after an early return — the hook count changes between renders");
  });

  it("keeps ConfirmDialog as the worked example, on the shared hook", () => {
    // The exemplar the rest of the app was migrated onto: trap, deliberate
    // initial focus on the confirm button, Escape, restore — one call.
    const confirm = readFileSync("src/components/ui/ConfirmDialog.tsx", "utf8");
    assert.match(confirm, /useFocusTrap\(dialogRef, open, \{ onEscape: onCancel, initialFocus: confirmBtnRef \}\)/);
    assert.doesNotMatch(confirm, /addEventListener\("keydown"/, "no hand-rolled Escape beside the hook's");
  });

  it("does not trap the panels that deliberately are not modal", () => {
    // `aria-modal="false"` is a real answer — the advisor drawer, the quick
    // note window and the work-session prompt leave the page usable behind
    // them on purpose, and trapping those would be the opposite bug.
    const nonModal = FILES.filter(file => file.text.includes('aria-modal="false"')).map(file => file.path);
    assert.ok(nonModal.length > 0, "the non-modal panels should still exist");
    for (const path of nonModal) {
      const file = FILES.find(entry => entry.path === path)!;
      if (file.text.includes('aria-modal="true"')) continue;
      assert.ok(!file.text.includes("useFocusTrap"), `${path} is not modal and must not trap focus`);
    }
  });
});
