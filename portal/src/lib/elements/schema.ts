// The machine-checkable half of an element definition.
//
// P2 of the element engine. `PropField` is a *form widget* descriptor — it says
// which control the properties panel should draw. It cannot answer "is this a
// legal value for this prop", which is the question an edit engine (and an
// assistant proposing edits) has to answer before anything is published.
//
// `ElementSchema` is that answer, and it is GENERATED from `fields`. There is
// deliberately no way to hand-write one: a second declaration of the same
// contract is exactly the drift this phase exists to delete. The one thing the
// generator cannot invent is intent, so anything it needs beyond the widget
// type (`required`, `min`, `pattern`, …) is an optional member on `PropField`
// itself — still one declaration.
//
// Runtime-dependency-free, same rule as the rest of `src/lib/elements`.

import type { BlockDefinition, ElementSurface, PropField, PropFieldType } from "./definition";
import { elementSurfaces } from "./definition";

// ─── Shape ────────────────────────────────────────────────────────────────

export interface ElementPropSchema {
  key: string;
  label: string;
  type: PropFieldType;
  /** True when the element cannot render sensibly without a value. */
  required: boolean;
  /** The single declared default. Mirrors the definition's `defaultProps`. */
  default?: unknown;
  /** Closed value set, from a `select` field's `options`. */
  enum?: string[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface ElementSchema {
  type: string;
  surfaces: readonly ElementSurface[];
  isContainer: boolean;
  props: ElementPropSchema[];
  /**
   * Props the definition ships a default for without declaring a field.
   *
   * Not an error: a handful of elements seed component-internal state (empty
   * `items` arrays, layout hints) that has no place in the properties panel.
   * Surfaced so an assistant knows the key exists and a reviewer can see the
   * list, rather than being silently invisible.
   */
  undeclared: string[];
}

// ─── Generation ───────────────────────────────────────────────────────────

function propSchema(field: PropField, defaults: Record<string, unknown>): ElementPropSchema {
  const declared = Object.prototype.hasOwnProperty.call(defaults, field.key);
  const schema: ElementPropSchema = {
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required === true,
  };
  // ONE default. The definition's `defaultProps` is the source; a field's own
  // `default` is the editor's placeholder copy of it, and `assertDefinition`
  // below is what stops the two drifting apart again.
  if (declared) schema.default = defaults[field.key];
  else if (field.default !== undefined) schema.default = field.default;

  if (field.type === "select" && field.options?.length) {
    schema.enum = field.options.map(option => option.value);
  }
  if (field.min !== undefined) schema.min = field.min;
  if (field.max !== undefined) schema.max = field.max;
  if (field.minLength !== undefined) schema.minLength = field.minLength;
  if (field.maxLength !== undefined) schema.maxLength = field.maxLength;
  if (field.pattern !== undefined) schema.pattern = field.pattern;
  return schema;
}

export function buildElementSchema(
  def: Pick<BlockDefinition, "type" | "fields" | "defaultProps" | "isContainer" | "surfaces">,
): ElementSchema {
  const defaults = def.defaultProps ?? {};
  const declaredKeys = new Set(def.fields.map(field => field.key));
  return {
    type: def.type,
    surfaces: elementSurfaces(def),
    isContainer: def.isContainer,
    props: def.fields.map(field => propSchema(field, defaults)),
    undeclared: Object.keys(defaults).filter(key => !declaredKeys.has(key)).sort(),
  };
}

// Memoised per definition object. Definitions are module-level singletons, so
// this is a one-entry-per-type cache that never grows with traffic.
const SCHEMA_CACHE = new WeakMap<object, ElementSchema>();

/** The generated schema for a definition. Derives once, then returns it. */
export function elementSchema(def: BlockDefinition): ElementSchema {
  if (def.schema) return def.schema;
  const cached = SCHEMA_CACHE.get(def);
  if (cached) return cached;
  const built = buildElementSchema(def);
  SCHEMA_CACHE.set(def, built);
  return built;
}

// ─── Validation ───────────────────────────────────────────────────────────

export interface ElementPropProblem {
  key: string;
  message: string;
}

const URL_ISH = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|\/|#|\{\{|\$\{)/;

function checkOne(prop: ElementPropSchema, value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return prop.required ? "is required but has no value" : null;
  }

  switch (prop.type) {
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) return `must be a number, got ${typeof value}`;
      if (prop.min !== undefined && value < prop.min) return `must be >= ${prop.min}`;
      if (prop.max !== undefined && value > prop.max) return `must be <= ${prop.max}`;
      return null;
    }
    case "boolean":
      return typeof value === "boolean" ? null : `must be a boolean, got ${typeof value}`;
    case "select": {
      if (typeof value !== "string") return `must be a string, got ${typeof value}`;
      if (prop.enum && !prop.enum.includes(value)) {
        return `"${value}" is not one of the declared options (${prop.enum.join(", ")})`;
      }
      return null;
    }
    case "url": {
      if (typeof value !== "string") return `must be a string, got ${typeof value}`;
      // Deliberately permissive: block hrefs are legitimately relative paths,
      // fragments, mailto:/tel:, or an unreplaced template token. What this
      // rejects is a bare word, which is the shape a typo takes.
      return URL_ISH.test(value) || value === "" ? null : `"${value}" is not a URL, path or anchor`;
    }
    case "text":
    case "textarea":
    case "richtext":
    case "color":
    case "image": {
      if (typeof value !== "string") return `must be a string, got ${typeof value}`;
      if (prop.minLength !== undefined && value.length < prop.minLength) return `must be at least ${prop.minLength} characters`;
      if (prop.maxLength !== undefined && value.length > prop.maxLength) return `must be at most ${prop.maxLength} characters`;
      if (prop.pattern !== undefined && !new RegExp(prop.pattern).test(value)) return `does not match ${prop.pattern}`;
      return null;
    }
    default:
      return null;
  }
}

/** Every problem with `props` against `schema`. Empty array means valid. */
export function validateElementProps(
  schema: ElementSchema,
  props: Record<string, unknown>,
): ElementPropProblem[] {
  const problems: ElementPropProblem[] = [];
  for (const prop of schema.props) {
    const message = checkOne(prop, props[prop.key]);
    if (message) problems.push({ key: prop.key, message });
  }
  return problems;
}

/**
 * The self-consistency check on a definition, separate from validating a
 * *value* against it.
 *
 * Two declarations of one default is the failure mode this catches: a field's
 * `default` is what the properties panel shows as a placeholder, while
 * `defaultProps` is what a newly inserted element actually gets. When they
 * disagree, the operator is shown one string and given another — silently, on
 * a surface that renders live client websites.
 */
export function assertDefinitionConsistent(
  def: Pick<BlockDefinition, "type" | "fields" | "defaultProps" | "isContainer" | "surfaces">,
): ElementPropProblem[] {
  const problems: ElementPropProblem[] = [];
  const defaults = def.defaultProps ?? {};

  for (const field of def.fields) {
    const hasDefaultProp = Object.prototype.hasOwnProperty.call(defaults, field.key);
    if (hasDefaultProp && field.default !== undefined) {
      const a = defaults[field.key];
      const b = field.default;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        problems.push({
          key: field.key,
          message: `defaultProps says ${JSON.stringify(a)} but the field default says ${JSON.stringify(b)}`,
        });
      }
    }
    if (field.required && !hasDefaultProp && field.default === undefined) {
      problems.push({ key: field.key, message: "is required but the definition ships no default for it" });
    }
  }

  // And the values themselves must satisfy the schema they generated.
  problems.push(...validateElementProps(buildElementSchema(def), defaults));
  return problems;
}
