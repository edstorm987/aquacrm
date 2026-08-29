// Which READS can write — issue #21, the enumeration itself.
//
// The finding says a call-graph pass found **28 API `GET` handlers** and
// **26 rendered page/layout files** with a reachable `mutate()` path, and that
// *"the rest of the inventory still needs classification and removal or
// deliberate mutation semantics."* Two of those paths have since been closed
// (the showcase fixture reset, Finance's default-currency patch) and the
// numbers were never re-derived.
//
// The problem with a number in a document is that it stops being true the day
// after it is written and nothing says so. This module re-derives it from
// source, so the answer is whatever the code says today — and the test beside
// it makes a NEW read path with a hidden write something somebody has to
// declare, with a reason, rather than something nobody notices.
//
// ── Why this is a NAME-level graph and not an import-level one ────────────
//
// The first version of this file asked "can this route's import graph reach a
// module that calls `mutate()`". That answered **46 of 49** GET-only routes and
// **94 of 124** rendered files, which is not an inventory — it is the
// observation that everything imports `@/server/tenants` eventually. A guard
// where almost every entry is flagged gets turned into a big allowlist nobody
// reads, and then it guards nothing.
//
// So the unit here is the FUNCTION, not the file. `listClients` and
// `createClient` live in the same module; importing the first does not
// implicate the second. A function is mutating when its own body calls
// `mutate()`, or when it references a name — local or imported — that is
// already known to be mutating, iterated to a fixpoint.
//
// ── What it is honest about ───────────────────────────────────────────────
//
// Still an approximation, and deliberately biased the same way:
//
//   • it over-reports — referencing a mutating name inside a branch that never
//     runs still counts, because a static pass cannot know;
//   • it under-reports through indirection it cannot see: a value called
//     through a variable, a method resolved off an object at runtime, a
//     `Promise.all` of dynamically chosen handlers.
//
// The second is the real limit and is worth stating plainly rather than
// pretending otherwise: this narrows an unusable 94-of-124 to something a
// person can read and classify, and it is not a proof of absence.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// `fileURLToPath`, not `url.pathname` — this repo lives under a directory with
// a SPACE in its name, and the raw pathname arrives percent-encoded.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

const CODE = /\.(ts|tsx)$/;
const RESOLVE_ORDER = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
const STORAGE = join("src", "server", "storage.ts");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "__smoke__") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE.test(entry)) out.push(full);
  }
  return out;
}

/** Strip comments so a `mutate()` inside one is not a call. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

// ─── One module ───────────────────────────────────────────────────────────

interface Binding {
  /** Repo-relative path of the module the name comes from, or null if unresolved. */
  from: string | null;
  /** The name AS EXPORTED there — `import { a as b }` binds b to a. */
  name: string;
}

interface Unit {
  name: string;
  /** A type declaration can never write, whatever its body happens to mention. */
  type: boolean;
  body: string;
  /** Names pulled out of a dynamic import by destructuring — see `unitFrom`. */
  named: Binding[];
  /** Identifiers this body mentions. */
  refs: Set<string>;
  /**
   * Modules this unit reaches through `await import("…")`, resolved.
   *
   * Held per UNIT, not per module. Attributing a module's dynamic imports to
   * every function in it made one `await import("@/server/types")` inside
   * `tenants.ts` mark `getAgency`, `listClients` and `getClientForAgency` as
   * writes — and from there most of the app. A rule that coarse does not
   * over-report at the edges; it destroys the answer.
   */
  dynamic: string[];
}

interface Module {
  file: string;
  /** Local identifier → where it came from. */
  imports: Map<string, Binding>;
  /** Top-level functions, consts and classes, by name. `default` is the default export. */
  units: Map<string, Unit>;
  /** `export { a as b }` and `export … from` — b here is a in there. */
  reexports: Map<string, Binding>;
}

const IDENT = /[A-Za-z_$][\w$]*/g;

function resolveSpec(file: string, spec: string): string | null {
  let base: string | null = null;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(join(ROOT, file)), spec);
  else if (spec.startsWith("@aqua/plugin-")) {
    const name = spec.slice("@aqua/plugin-".length).split("/")[0]!;
    const sub = spec.split("/").slice(1).join("/");
    base = join(SRC, "built-ins/modules", name, "src", sub || "index");
  }
  if (!base) return null;
  for (const suffix of RESOLVE_ORDER) {
    try { if (statSync(base + suffix).isFile()) return relative(ROOT, base + suffix); } catch { /* next */ }
  }
  return null;
}

const IMPORT_CLAUSE = /import\s+(?:type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
// `await import(…)`, not every `import(…)`. TypeScript's inline type syntax —
// `endCustomers?: import("./types").ClientEndCustomerConfig` — is not a runtime
// import, and counting it made `types.ts` reach half the app.
const DYNAMIC = /await\s+import\s*\(\s*["']([^"']+)["']\s*\)/g;

function parseImports(file: string, source: string): Map<string, Binding> {
  const out = new Map<string, Binding>();
  for (const match of source.matchAll(IMPORT_CLAUSE)) {
    const clause = match[1]!;
    const target = resolveSpec(file, match[2]!);
    const braces = clause.match(/\{([\s\S]*?)\}/);
    if (braces) {
      for (const raw of braces[1]!.split(",")) {
        const part = raw.trim().replace(/^type\s+/, "");
        if (!part) continue;
        const [exported, local] = part.split(/\s+as\s+/).map(s => s.trim());
        out.set(local || exported!, { from: target, name: exported! });
      }
    }
    // `import x from` / `import * as x from` — the whole module under one name.
    const bare = clause.replace(/\{[\s\S]*?\}/, "").replace(/^\s*,|,\s*$/g, "").trim();
    const star = bare.match(/^\*\s+as\s+([\w$]+)$/);
    if (star) out.set(star[1]!, { from: target, name: "*" });
    else if (/^[\w$]+$/.test(bare)) out.set(bare, { from: target, name: "default" });
  }
  return out;
}

/**
 * Cut the module into top-level units.
 *
 * Deliberately crude: it splits on top-level declarations at column zero and
 * takes everything up to the next one. A body that swallows a trailing blank
 * line costs nothing; the alternative is a parser, and this file is a sweep.
 */
// `interface`/`type`/`enum` are boundaries too, even though they can never
// write. Without them a function's body ran on through the declarations that
// follow it — and `listClients` ended up "mutating" because the interface
// beneath it contains an inline `import("./types")` type reference.
const DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\s+([\w$]+)|class\s+([\w$]+)|(?:const|let|var)\s+([\w$]+)\s*=|(?:interface|enum)\s+([\w$]+)|type\s+([\w$]+)\s*=)/gm;
const DEFAULT_FN = /^export\s+default\s+(?:async\s+)?function\s*([\w$]*)/m;
const DEFAULT_NAME = /^export\s+default\s+([\w$]+)\s*;?\s*$/m;

// A dynamic import that immediately names what it wants:
//   const { listPhasesForAgency } = await import("@/server/phases")
//   await import("…").then(({ getCachedBusinessIssueRadar }) => …)
// Both forms say exactly which export is being used, so the blanket "this
// module contains a writer somewhere" rule is wrong for them — the phase editor
// pulls `listPhasesForAgency` out of a module that also exports `upsertPhase`
// and `deletePhase`, and being charged for its neighbours is the same mistake
// as import-level reachability, just later in the file.
const DYNAMIC_DESTRUCTURED = /(?:const\s*\{([^}]*)\}\s*=\s*await\s+import\s*\(\s*["']([^"']+)["']\s*\)|await\s+import\s*\(\s*["']([^"']+)["']\s*\)\s*\.then\s*\(\s*\(?\s*\{([^}]*)\})/g;

function unitFrom(file: string, name: string, body: string): Unit {
  const type = /^(?:export\s+)?(?:declare\s+)?(?:interface|type|enum)\s/.test(body);
  const named: Binding[] = [];
  const precise = new Set<string>();
  for (const match of body.matchAll(DYNAMIC_DESTRUCTURED)) {
    const spec = match[2] ?? match[3]!;
    const clause = match[1] ?? match[4]!;
    const target = resolveSpec(file, spec);
    if (!target) continue;
    precise.add(spec);
    for (const raw of clause.split(",")) {
      const part = raw.trim();
      if (!part) continue;
      const [exported, local] = part.split(/\s*:\s*/).map(piece => piece.trim());
      named.push({ from: target, name: exported! });
      void local;
    }
  }
  const dynamic: string[] = [];
  for (const match of body.matchAll(DYNAMIC)) {
    if (precise.has(match[1]!)) continue;               // already named precisely
    const target = resolveSpec(file, match[1]!);
    if (target) dynamic.push(target);
  }
  return { name, type, body, refs: new Set(body.match(IDENT) ?? []), dynamic, named };
}

function parseUnits(file: string, source: string): Map<string, Unit> {
  const units = new Map<string, Unit>();
  const marks: { name: string; at: number }[] = [];
  for (const match of source.matchAll(DECL)) {
    const name = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
    if (name) marks.push({ name, at: match.index! });
  }
  for (let index = 0; index < marks.length; index += 1) {
    const start = marks[index]!.at;
    const end = index + 1 < marks.length ? marks[index + 1]!.at : source.length;
    const body = source.slice(start, end);
    units.set(marks[index]!.name, unitFrom(file, marks[index]!.name, body));
  }
  // The default export, under the name "default", so a page can be asked about.
  const named = source.match(DEFAULT_FN);
  if (named) {
    const alias = named[1] || "";
    const unit = alias ? units.get(alias) : undefined;
    if (unit) units.set("default", unit);
    else {
      const at = source.indexOf(named[0]);
      const nextAt = [...source.matchAll(DECL)].map(m => m.index!).find(i => i > at) ?? source.length;
      const body = source.slice(at, nextAt);
      units.set("default", unitFrom(file, "default", body));
    }
  } else {
    const indirect = source.match(DEFAULT_NAME);
    const unit = indirect ? units.get(indirect[1]!) : undefined;
    if (unit) units.set("default", unit);
  }
  return units;
}

const REEXPORT_FROM = /export\s+\{([\s\S]*?)\}\s*from\s*["']([^"']+)["']/g;
const REEXPORT_LOCAL = /export\s+\{([\s\S]*?)\}\s*;/g;
const STAR_FROM = /export\s+\*\s+from\s*["']([^"']+)["']/g;

function parseReexports(file: string, source: string): Map<string, Binding> {
  const out = new Map<string, Binding>();
  for (const match of source.matchAll(REEXPORT_FROM)) {
    const target = resolveSpec(file, match[2]!);
    for (const raw of match[1]!.split(",")) {
      const part = raw.trim().replace(/^type\s+/, "");
      if (!part) continue;
      const [exported, local] = part.split(/\s+as\s+/).map(s => s.trim());
      out.set(local || exported!, { from: target, name: exported! });
    }
  }
  for (const match of source.matchAll(REEXPORT_LOCAL)) {
    if (/from\s*["']/.test(match[0])) continue;
    for (const raw of match[1]!.split(",")) {
      const part = raw.trim().replace(/^type\s+/, "");
      if (!part) continue;
      const [local, exported] = part.split(/\s+as\s+/).map(s => s.trim());
      out.set(exported || local!, { from: null, name: local! });
    }
  }
  for (const match of source.matchAll(STAR_FROM)) {
    const target = resolveSpec(file, match[1]!);
    if (target) out.set(`__star__${target}`, { from: target, name: "*" });
  }
  return out;
}

// ─── The graph ────────────────────────────────────────────────────────────

export interface CallGraph {
  modules: Map<string, Module>;
  /** `file#name` for every unit that can reach `mutate()`. */
  mutating: Set<string>;
}

const key = (file: string, name: string) => `${file}#${name}`;

/**
 * Functions that MENTION a writer without calling one.
 *
 * A static pass cannot tell `register({ activity: activityPort })` from
 * `activityPort.logActivity(...)`, or a factory that RETURNS a handle whose
 * `set` writes from one that writes. Both patterns are real here, and left
 * alone they carry a write claim up through a dozen callers - the Radar, the
 * company health snapshot, the staff capacity snapshot and the agency LAYOUT
 * were all "writes" because a foundation adapter three levels down hands a
 * logging port to a plugin registry.
 *
 * Suppressing the hand-over itself is narrow and checkable, and it beats
 * suppressing the callers: everything downstream is then RE-DERIVED, so a
 * caller that reaches a writer some other way keeps its entry and shows the
 * chain that actually applies. Each entry owes a justification, and the test
 * requires one.
 */
export type PassThrough = Record<string, string>;

export function buildCallGraph(passThrough: PassThrough = {}): CallGraph {
  const modules = new Map<string, Module>();
  for (const absolute of walk(SRC)) {
    const file = relative(ROOT, absolute);
    const source = stripComments(readFileSync(absolute, "utf-8"));
    modules.set(file, {
      file,
      imports: parseImports(file, source),
      units: parseUnits(file, source),
      reexports: parseReexports(file, source),
    });
  }

  // Seed: units whose own body calls `mutate(`, excluding storage itself.
  //
  // The whole of `src/server/storage.ts` is excluded, not just its `mutate`
  // definition. It is the storage layer: `ensureHydrated` loads state and, in
  // the signed-request realm, writes as part of doing so. That is ORDINARY
  // HYDRATION — the original pass excluded it by name for the same reason — and
  // counting it makes every route that touches state look like a hidden write,
  // which is how the first version of this file reached 44 of 48 and said
  // nothing.
  const mutating = new Set<string>();
  for (const module of modules.values()) {
    if (module.file === STORAGE) continue;
    // Only when `mutate` is actually IMPORTED here, so a local helper called
    // `mutate` in an unrelated module is not mistaken for the write primitive.
    const binding = module.imports.get("mutate");
    if (!binding || binding.from !== STORAGE) continue;
    // Keyed by the MAP KEY, not `unit.name` — the default export is an alias
    // onto the same unit object, so keying by the object's own name would leave
    // every page's `default` permanently unclassified. That is what made the
    // first run report zero writing renders while the pipelines page installs a
    // plugin on ordinary navigation.
    for (const [name, unit] of module.units) {
      if (unit.type) continue;
      if (passThrough[key(module.file, name)]) continue;
      if (/(?:^|[^\w.])mutate\s*\(/.test(unit.body)) mutating.add(key(module.file, name));
    }
  }

  const moduleMutates = (file: string): boolean => {
    const target = modules.get(file);
    return Boolean(target && [...target.units.keys()].some(name => mutating.has(key(file, name))));
  };

  /** Where does a name used inside `module` actually live? */
  function resolveName(module: Module, name: string): string | null {
    if (module.units.has(name)) return key(module.file, name);
    const binding = module.imports.get(name);
    if (!binding?.from) return null;
    return key(binding.from, binding.name);
  }

  // Fixpoint: a unit is mutating when it mentions a mutating name.
  let changed = true;
  while (changed) {
    changed = false;
    for (const module of modules.values()) {
      if (module.file === STORAGE) continue;              // hydration, not a hidden write
      // A namespace or dynamic import pulls in the whole module: if ANY of its
      // units mutate, a unit that mentions the namespace can reach one.
      const namespaces: string[] = [];
      for (const [local, binding] of module.imports) {
        if (binding.name === "*" && binding.from) namespaces.push(local);
      }
      for (const [name, unit] of module.units) {
        if (unit.type) continue;                          // a shape cannot write
        const id = key(module.file, name);
        if (passThrough[id]) continue;                    // hands a writer over, never calls it
        if (mutating.has(id)) continue;
        let reaches = false;
        for (const ref of unit.refs) {
          const target = resolveName(module, ref);
          if (target && target !== id && mutating.has(target)) { reaches = true; break; }
          // A re-export forwards the name onward.
          const forwarded = module.reexports.get(ref);
          if (forwarded?.from && mutating.has(key(forwarded.from, forwarded.name))) { reaches = true; break; }
        }
        // A namespace import (`import * as x`) hides the name, so any mutating
        // export in that module counts — but only for a unit that MENTIONS the
        // namespace.
        if (!reaches) {
          for (const local of namespaces) {
            if (!unit.refs.has(local)) continue;
            const from = module.imports.get(local)!.from!;
            if (moduleMutates(from)) { reaches = true; break; }
          }
        }
        // A dynamic import that names what it wants is charged for that name
        // only.
        if (!reaches) {
          for (const binding of unit.named) {
            if (binding.from && mutating.has(key(binding.from, binding.name))) { reaches = true; break; }
          }
        }
        // …and an unnamed one is charged for the whole module, which is how
        // several plugin surfaces reach the code that provisions them.
        if (!reaches) {
          for (const from of unit.dynamic) if (moduleMutates(from)) { reaches = true; break; }
        }
        if (reaches) { mutating.add(id); changed = true; }
      }
    }
  }

  return { modules, mutating };
}

// ─── Entries ──────────────────────────────────────────────────────────────

const METHOD = /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)\b/g;

export interface RouteEntry {
  file: string;
  /** The URL path it serves, derived from the directory. */
  path: string;
  methods: string[];
}

export function apiRoutes(graph: CallGraph): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (const [file] of graph.modules) {
    if (!file.startsWith(join("src", "app", "api"))) continue;
    if (!/route\.tsx?$/.test(file)) continue;
    const source = stripComments(readFileSync(join(ROOT, file), "utf-8"));
    const methods = [...new Set([...source.matchAll(METHOD)].map(m => m[1]!))];
    if (!methods.length) continue;
    const path = "/" + relative(join("src", "app"), dirname(file))
      .split("/").filter(part => !part.startsWith("(")).join("/");
    out.push({ file, path, methods });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * GET-only routes whose `GET` can reach a write.
 *
 * GET-only because a route that also exports POST is a mutating surface by
 * design; asking whether it can write answers nothing.
 */
export function writingReadRoutes(graph: CallGraph): RouteEntry[] {
  return apiRoutes(graph)
    .filter(route => route.methods.length === 1 && route.methods[0] === "GET")
    .filter(route => graph.mutating.has(key(route.file, "GET")));
}

export function renderedFiles(graph: CallGraph): string[] {
  return [...graph.modules.keys()]
    .filter(file => file.startsWith(join("src", "app")))
    .filter(file => /\/(page|layout)\.tsx$/.test(file))
    .sort();
}

/** Rendered pages and layouts whose default export can reach a write. */
export function writingRenders(graph: CallGraph): string[] {
  return renderedFiles(graph).filter(file => graph.mutating.has(key(file, "default")));
}

/**
 * WHY an entry is flagged — the first mutating name its body reaches.
 *
 * The cause matters more than the flag: "this page calls
 * `ensureDefaultAgencyProducts`" is something a person can rule on, while "this
 * page can write" is not. It is also what makes a declared inventory checkable
 * — a path whose cause CHANGES is a different finding wearing the same name.
 */
export function causeOf(graph: CallGraph, file: string, name: string): string {
  const module = graph.modules.get(file);
  const unit = module?.units.get(name);
  if (!module || !unit) return "";
  if (/(?:^|[^\w.])mutate\s*\(/.test(unit.body)) return "mutate()";
  for (const ref of unit.refs) {
    let target: string | null = null;
    if (module.units.has(ref)) target = key(file, ref);
    else {
      const binding = module.imports.get(ref);
      if (binding?.from) target = key(binding.from, binding.name);
    }
    if (!target || target === key(file, name) || !graph.mutating.has(target)) continue;
    // The default export is an alias onto the same body; naming it as the cause
    // would say "this page writes because this page writes".
    const local = module.units.get(ref);
    if (local && local.body === unit.body) continue;
    return ref;
  }
  for (const [local, binding] of module.imports) {
    if (binding.name !== "*" || !binding.from || !unit.refs.has(local)) continue;
    return `namespace ${local}`;
  }
  for (const binding of unit.named) {
    if (binding.from && graph.mutating.has(key(binding.from, binding.name))) return binding.name;
  }
  for (const target of unit.dynamic) {
    const module_ = graph.modules.get(target);
    if (module_ && [...module_.units.keys()].some(n => graph.mutating.has(key(target, n)))) {
      return `await import("${target}")`;
    }
  }
  return "unknown";
}
