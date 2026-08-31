// No component may update ANOTHER component while it renders.
//
// ── Why this exists ──────────────────────────────────────────────────────
//
// `/portal/agency` intermittently logged:
//
//     Can't perform a React state update on a component that hasn't mounted yet.
//
// `CLAUDE.md` item 6 lists it as open residue under "hidden render-time
// mutation". It is timing dependent — it did not reproduce across 51 loads of
// that page in three consecutive browser-matrix runs — so a browser walk is the
// wrong instrument for it. This is the right one: React's warning names a
// STRUCTURAL mistake, and structure can be read from the source whether or not
// the timing happens to line up on the day you look.
//
// ── The distinction this file turns on ───────────────────────────────────
//
// Setting state during render is not itself a bug. React documents "adjusting
// state when props change": call your OWN setter during render, behind a guard,
// and React re-renders the component immediately, before committing, without
// warning. Three components here do exactly that, each with a comment saying
// why, and each is correct:
//
//   · BattleTableWorkspace  — reconciles navigation against the scopes it was given
//   · AppConfigEditor       — re-syncs when the server hands it a newer revision
//   · EmailButton           — kills a draft when the recipient changes underneath it
//
// What React warns about is updating a DIFFERENT component mid-render: calling a
// callback that arrived as a prop, or a dispatch/emit that lands on somebody
// else. That is the shape this file forbids.
//
// ── What the scan found ──────────────────────────────────────────────────
//
// Across 750 client components: zero. So the warning's source is NOT a
// synchronous cross-component update in application code — it is an async
// callback (a promise, timer or observer) resolving before its target mounts,
// or something inside a dependency. That negative result is worth keeping: it
// removes the most likely explanation from the hunt, and this test keeps it
// true.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function clientComponents(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".next-")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) clientComponents(full, found);
    else if (entry.endsWith(".tsx")) found.push(full);
  }
  return found;
}

/** A call that plausibly updates somebody else's state. */
const FOREIGN_UPDATE = /^(on[A-Z]|set[A-Z]|dispatch$|emit$|notify$)/;

type RenderCall = { file: string; line: number; component: string; callee: string; guarded: boolean };

/**
 * Every call made in a component's own render body — that is, not inside a
 * nested function, so not in an effect, handler, callback or `useMemo`.
 *
 * `ownSetters` is what the component's own `useState` returned. A render-phase
 * call to one of those is React's supported adjustment; a render-phase call to
 * anything else is not.
 */
function renderPhaseCalls(file: string): RenderCall[] {
  const source = readFileSync(file, "utf8");
  if (!source.includes("use client")) return [];
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const calls: RenderCall[] = [];

  const componentOf = (node: ts.Node): [string, ts.Node] | null => {
    if (ts.isFunctionDeclaration(node) && node.body && node.name && /^[A-Z]/.test(node.name.text)) {
      return [node.name.text, node.body];
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && /^[A-Z]/.test(declaration.name.text) && declaration.initializer
          && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
          return [declaration.name.text, declaration.initializer.body];
        }
      }
    }
    return null;
  };

  for (const statement of sf.statements) {
    const component = componentOf(statement);
    if (!component) continue;
    const [name, body] = component;

    const ownSetters = new Set<string>();
    const collectSetters = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer)
        && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === "useState"
        && ts.isArrayBindingPattern(node.name)) {
        const setter = node.name.elements[1];
        if (setter && ts.isBindingElement(setter) && ts.isIdentifier(setter.name)) ownSetters.add(setter.name.text);
      }
      ts.forEachChild(node, collectSetters);
    };
    collectSetters(body);

    // `guarded` tracks whether we are inside an `if`. React's adjustment
    // pattern REQUIRES one: an unguarded setter during render re-renders
    // forever.
    const visit = (node: ts.Node, guarded: boolean): void => {
      // Do not descend into nested functions — those run after render.
      if (ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isFunctionDeclaration(node)) return;
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && FOREIGN_UPDATE.test(node.expression.text)) {
        calls.push({
          file: relative(ROOT, file),
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          component: name,
          callee: node.expression.text,
          guarded,
        });
      }
      const inIf = guarded || ts.isIfStatement(node);
      ts.forEachChild(node, child => visit(child, ts.isIfStatement(node) ? node.thenStatement === child || node.elseStatement === child : inIf));
    };
    ts.forEachChild(body, child => visit(child, false));

    // Attach ownership after the walk, so the assertions below can split them.
    for (const call of calls) {
      if (call.component === name) (call as RenderCall & { own?: boolean }).own = ownSetters.has(call.callee);
    }
  }
  return calls as (RenderCall & { own?: boolean })[];
}

const files = clientComponents(join(ROOT, "src"));
const calls = files.flatMap(renderPhaseCalls) as (RenderCall & { own?: boolean })[];

describe("render-phase state updates", () => {
  it("scans the whole client surface", () => {
    // A collector that found nothing would make every assertion below
    // vacuously true — the failure this file most needs to avoid, since its
    // headline result is a NEGATIVE one.
    assert.ok(files.length > 500, `expected the full client surface, collected ${files.length} .tsx files`);
  });

  it("never updates another component during render", () => {
    // The actual React warning. A prop callback, dispatch or emit called in a
    // render body reaches out of this component and into one that may not have
    // mounted — which is exactly what "/portal/agency" was reporting.
    const foreign = calls
      .filter(call => call.own !== true)
      .map(call => `${call.file}:${call.line}  ${call.component}() calls ${call.callee}(...)`);

    assert.deepEqual(
      foreign,
      [],
      "these calls happen during render and are not the component's own useState setter, "
      + "so they update somebody else mid-render:\n  " + foreign.join("\n  ") + "\n"
      + "Move the call into an effect or an event handler.",
    );
  });

  it("guards every state adjustment it does make during render", () => {
    // The supported pattern, and the one way to get it wrong: without a
    // condition, setting state during render re-renders forever.
    const unguarded = calls
      .filter(call => call.own === true && !call.guarded)
      .map(call => `${call.file}:${call.line}  ${call.component}() calls ${call.callee}(...)`);

    assert.deepEqual(
      unguarded,
      [],
      "these render-phase setters are not inside a condition, so they re-render forever:\n  "
      + unguarded.join("\n  "),
    );
  });

  it("still finds the three adjustments that are meant to be there", () => {
    // If a refactor removes them the scan would report a clean sheet for the
    // wrong reason, and the two assertions above would pass over nothing.
    const owners = new Set(calls.filter(call => call.own === true).map(call => call.component));
    for (const component of ["BattleTableWorkspace", "AppConfigEditor", "EmailButton"]) {
      assert.ok(owners.has(component), `${component} no longer adjusts state during render — if that is deliberate, drop it from this list`);
    }
  });
});
